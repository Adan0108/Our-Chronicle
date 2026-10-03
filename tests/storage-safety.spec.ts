import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalBookStorage } from "../src/lib/storage/local";
import { decodeArchive } from "../src/lib/storage/archive";
import type { Book } from "../src/types/book";

const testStorageRoot = path.resolve(".test-storage");

function isolatedStorage() {
  const root = path.join(testStorageRoot, `.safety-${randomUUID()}`);
  const previous = process.env.SCRAPBOOK_STORAGE_DIR;
  process.env.SCRAPBOOK_STORAGE_DIR = root;
  let storage: LocalBookStorage;
  try {
    // The adapter captures its root in its constructor. Restore the worker's
    // environment immediately; the Next.js server is a separate process.
    storage = new LocalBookStorage();
  } finally {
    if (previous === undefined) delete process.env.SCRAPBOOK_STORAGE_DIR;
    else process.env.SCRAPBOOK_STORAGE_DIR = previous;
  }
  return { root, storage };
}

async function cleanup(root: string) {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== testStorageRoot ||
    !/^\.safety-[0-9a-f-]+$/.test(path.basename(resolved))
  )
    throw new Error(
      "Refusing to remove a directory outside isolated test storage",
    );
  await rm(resolved, { recursive: true, force: true });
}

async function imageFiles(root: string): Promise<string[]> {
  return (await readdir(path.join(root, "images"), { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

async function snapshot(root: string) {
  const filenames = await imageFiles(root);
  const images = new Map<string, Buffer>();
  for (const filename of filenames)
    images.set(filename, await readFile(path.join(root, "images", filename)));
  return { json: await readFile(path.join(root, "book.json")), images };
}

async function expectUnchanged(
  root: string,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  const after = await snapshot(root);
  expect(after.json).toEqual(before.json);
  expect(after.images).toEqual(before.images);
  expect(
    (await readdir(root)).filter((filename) =>
      filename.startsWith(".incoming-"),
    ),
  ).toEqual([]);
}

test("import and reset preserve all current files when the safety backup cannot be created", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const book = await storage.readBook();
    const archive = await storage.exportBook(book.revision);
    const before = await snapshot(root);
    const blocker = Buffer.from(
      "This file blocks creation of the backup folder.",
    );
    await writeFile(path.join(root, "backups"), blocker, { flag: "wx" });

    await expect(storage.importBook(archive, book.revision)).rejects.toThrow();
    await expectUnchanged(root, before);
    await expect(storage.resetBook(book.revision)).rejects.toThrow();
    await expectUnchanged(root, before);
    expect(await readFile(path.join(root, "backups"))).toEqual(blocker);
    expect((await storage.readBook()).revision).toBe(book.revision);
  } finally {
    await cleanup(root);
  }
});

test("a failed final book commit rolls back staged images and retains a valid safety backup", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const book = await storage.readBook();
    const archive = await storage.exportBook(book.revision);
    const before = await snapshot(root);
    const boundary = storage as unknown as {
      atomicWrite: (incoming: Book) => Promise<void>;
    };
    const originalWrite = boundary.atomicWrite;
    let promoted: string[] = [];
    let pendingBook: Book | undefined;
    boundary.atomicWrite = async (incoming) => {
      pendingBook = incoming;
      promoted = (await imageFiles(root)).filter(
        (filename) => !before.images.has(filename),
      );
      throw new Error("Injected book commit failure");
    };
    try {
      await expect(storage.importBook(archive, book.revision)).rejects.toThrow(
        "Injected book commit failure",
      );
    } finally {
      boundary.atomicWrite = originalWrite;
    }

    // The injected failure occurs after every new asset was promoted, so this
    // checks the rollback boundary rather than only an early validation error.
    expect(promoted).toHaveLength(before.images.size);
    expect(pendingBook?.revision).toBe(book.revision + 1);
    await expectUnchanged(root, before);
    expect(await storage.readBook()).toEqual(book);
    const backups = await readdir(path.join(root, "backups"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^our-chronicle-.*-before-import-.*\.zip$/);
    const restored = await decodeArchive(
      await readFile(path.join(root, "backups", backups[0])),
    );
    expect(restored.book).toEqual(book);
    expect(restored.images).toEqual(before.images);
  } finally {
    await cleanup(root);
  }
});
