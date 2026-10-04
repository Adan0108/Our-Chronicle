import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { z } from "zod";
import { LocalBookStorage as CurrentLocalBookStorage } from "../src/lib/storage/local";
import { StorageError } from "../src/lib/storage/errors";
import { decodeArchive } from "../src/lib/storage/archive";
import type { BookStorage } from "../src/lib/storage/index";
import { createSticker } from "../src/lib/decorations";
import { elementSchema, type Book } from "../src/types/book";

const testStorageRoot = path.resolve(".test-storage");
const cache = globalThis as typeof globalThis & {
  chronicleStorage?: BookStorage;
};

function atRoot(root: string) {
  const previous = process.env.SCRAPBOOK_STORAGE_DIR;
  process.env.SCRAPBOOK_STORAGE_DIR = root;
  try {
    return new CurrentLocalBookStorage();
  } finally {
    if (previous === undefined) delete process.env.SCRAPBOOK_STORAGE_DIR;
    else process.env.SCRAPBOOK_STORAGE_DIR = previous;
  }
}

async function cleanup(root: string) {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== testStorageRoot ||
    !/^\.cache-[0-9a-f-]+$/.test(path.basename(resolved))
  )
    throw new Error(
      "Refusing to remove a directory outside cache test storage",
    );
  await rm(resolved, { recursive: true, force: true });
}

function restoreCache(previous: BookStorage | undefined) {
  if (previous === undefined) delete cache.chronicleStorage;
  else cache.chronicleStorage = previous;
}

// Evaluate the real bootstrap as a freshly reloaded module, injecting the
// current constructor. Node's import cache alone cannot simulate dev HMR.
async function reloadStorageModule() {
  const source = await readFile(
    path.resolve("src/lib/storage/index.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} as { storage: BookStorage } };
  const requireModule = (name: string) => {
    if (name === "./local")
      return { LocalBookStorage: CurrentLocalBookStorage };
    if (name === "./errors") return { StorageError };
    throw new Error(`Unexpected runtime import in storage bootstrap: ${name}`);
  };
  new Function("require", "module", "exports", compiled)(
    requireModule,
    loaded,
    loaded.exports,
  );
  return loaded.exports.storage;
}

const textImageOnlySchema = z.object({
  pages: z.array(
    z.object({
      elements: z.array(
        z.discriminatedUnion("type", [
          elementSchema.options[0],
          elementSchema.options[1],
        ]),
      ),
    }),
  ),
});

// An earlier module generation has the same class name but different method
// closures/prototype. Its existing root and queue come from the real adapter.
const EarlierLocalBookStorage = class LocalBookStorage {
  declare queue: Promise<unknown>;
  declare root: string;
  async saveBook(book: Book) {
    textImageOnlySchema.parse(book);
    return book;
  }
  locked<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(fn);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
};

test("reloaded storage refreshes stale text/image validation and persists portable built-in stickers", async () => {
  const previous = cache.chronicleStorage;
  const root = path.join(testStorageRoot, `.cache-${randomUUID()}`);
  const adapter = atRoot(root);
  try {
    const initial = await adapter.readBook();
    const sticker = createSticker("coffee");
    const pageId = randomUUID();
    const updated: Book = {
      ...initial,
      pages: [
        ...initial.pages,
        {
          id: pageId,
          title: "A fresh sticker memory",
          paper: "cream",
          elements: [sticker],
        },
      ],
    };
    Object.setPrototypeOf(adapter, EarlierLocalBookStorage.prototype);
    cache.chronicleStorage = adapter;
    expect(adapter instanceof CurrentLocalBookStorage).toBe(false);
    await expect(adapter.saveBook(updated)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_union",
          path: ["pages", initial.pages.length, "elements", 0, "type"],
        }),
      ],
    });
    const refreshed = await reloadStorageModule();
    expect(refreshed).toBe(adapter);
    expect(cache.chronicleStorage).toBe(adapter);
    expect(adapter instanceof CurrentLocalBookStorage).toBe(true);
    const saved = await refreshed.saveBook(updated);
    expect((await atRoot(root).readBook()).pages.at(-1)?.elements).toEqual([
      sticker,
    ]);
    const exported = await refreshed.exportBook(saved.revision);
    expect((await decodeArchive(exported)).book.pages.at(-1)?.elements).toEqual(
      [sticker],
    );
    const imported = await refreshed.importBook(exported, saved.revision);
    const restored = await atRoot(root).readBook();
    expect(restored).toEqual(imported.book);
    expect(restored.pages.at(-1)?.id).toBe(pageId);
    expect(restored.pages.at(-1)?.elements).toEqual([sticker]);
    expect(await reloadStorageModule()).toBe(adapter);
  } finally {
    restoreCache(previous);
    await cleanup(root);
  }
});

test("cache refresh retains object/root/queue identity and serializes late requests from an older module", async () => {
  const previous = cache.chronicleStorage;
  const root = path.join(testStorageRoot, `.cache-${randomUUID()}`);
  const adapter = atRoot(root);
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await adapter.readBook();
    Object.setPrototypeOf(adapter, EarlierLocalBookStorage.prototype);
    cache.chronicleStorage = adapter;
    const old = adapter as unknown as InstanceType<
      typeof EarlierLocalBookStorage
    >;
    const oldEnqueue = old.locked.bind(old);
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = oldEnqueue(async () => {
      order.push("old started");
      started();
      await gate;
      order.push("old finished");
    });
    await start;
    const originalQueue = old.queue;
    const originalRoot = old.root;
    const refreshed = await reloadStorageModule();
    expect(refreshed).toBe(adapter);
    expect(old.queue).toBe(originalQueue);
    expect(old.root).toBe(originalRoot);
    const current = refreshed as unknown as {
      locked<T>(fn: () => Promise<T>): Promise<T>;
    };
    const next = current.locked(async () => {
      order.push("new request");
    });
    // A request which captured an earlier module can finish parsing its body
    // after HMR and enqueue through its old closure. It still shares the queue.
    const late = oldEnqueue(async () => {
      order.push("late old request");
    });
    expect(order).toEqual(["old started"]);
    release();
    await Promise.all([pending, next, late]);
    expect(order).toEqual([
      "old started",
      "old finished",
      "new request",
      "late old request",
    ]);
  } finally {
    release();
    restoreCache(previous);
    await cleanup(root);
  }
});

test("cache bootstrap leaves unrelated storage implementations untouched", async () => {
  const previous = cache.chronicleStorage;
  try {
    const custom = new (class OtherStorage {})() as BookStorage;
    const originalPrototype = Object.getPrototypeOf(custom);
    cache.chronicleStorage = custom;
    expect(await reloadStorageModule()).toBe(custom);
    expect(Object.getPrototypeOf(custom)).toBe(originalPrototype);
  } finally {
    restoreCache(previous);
  }
});

type ErrorModule = typeof import("../src/lib/storage/errors");

async function evaluateModule<T>(
  filename: string,
  requireModule: (name: string) => unknown,
  logger = console,
) {
  const source = await readFile(path.resolve(filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} as T };
  new Function("require", "module", "exports", "console", compiled)(
    requireModule,
    loaded,
    loaded.exports,
    logger,
  );
  return loaded.exports;
}

test("API error translation trusts branded storage errors across module generations and rejects lookalikes", async () => {
  const unexpectedImport = (name: string) => {
    throw new Error(`Unexpected error-module import: ${name}`);
  };
  const older = await evaluateModule<ErrorModule>(
    "src/lib/storage/errors.ts",
    unexpectedImport,
  );
  const newer = await evaluateModule<ErrorModule>(
    "src/lib/storage/errors.ts",
    unexpectedImport,
  );
  expect(older.StorageError).not.toBe(newer.StorageError);
  const logged: unknown[][] = [];
  const loadApi = (errors: ErrorModule) =>
    evaluateModule<typeof import("../src/lib/api")>(
      "src/lib/api.ts",
      (name) => {
        if (name === "zod") return { ZodError: z.ZodError };
        if (name === "./storage/errors") return errors;
        return unexpectedImport(name);
      },
      { ...console, error: (...args: unknown[]) => logged.push(args) },
    );
  const oldApi = await loadApi(older);
  const newApi = await loadApi(newer);
  for (const [api, source, other] of [
    [oldApi, newer, older],
    [newApi, older, newer],
  ] as const) {
    for (const status of [400, 404, 409, 413, 500]) {
      const error = new source.StorageError(
        "A trusted storage failure",
        status,
      );
      expect(error instanceof other.StorageError).toBe(false);
      expect(other.isStorageError(error)).toBe(true);
      const response = api.apiError(error);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: error.message });
    }
  }
  expect(logged).toHaveLength(0);

  const branded = new newer.StorageError(
    "Serialized errors lose their brand",
    404,
  );
  const lookalikes: unknown[] = [
    { message: "Untrusted plain data", status: 404 },
    Object.assign(new Error("Unbranded error"), { status: 409 }),
    JSON.parse(JSON.stringify(branded)),
    Object.create(branded),
    new newer.StorageError("Invalid HTTP status", 399),
    new newer.StorageError("Invalid HTTP status", 600),
    new newer.StorageError("Fractional HTTP status", 404.5),
  ];
  for (const error of lookalikes) {
    expect(older.isStorageError(error)).toBe(false);
    const response = oldApi.apiError(error);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error:
        "Could not access local storage. Check that the storage folder is writable.",
    });
  }
  expect(logged).toHaveLength(lookalikes.length);
});
