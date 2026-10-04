import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import yauzl from "yauzl";
import yazl from "yazl";
import { bookElements, resolveCover } from "../src/lib/cover";
import { decodeArchive, referencedImages } from "../src/lib/storage/archive";
import { LocalBookStorage } from "../src/lib/storage/local";
import { createSampleBook } from "../src/lib/storage/sample";
import { bookSchema, type Book, type ImageElement } from "../src/types/book";

const testStorageRoot = path.resolve(".test-storage");

function atRoot(root: string) {
  const previous = process.env.SCRAPBOOK_STORAGE_DIR;
  process.env.SCRAPBOOK_STORAGE_DIR = root;
  try {
    return new LocalBookStorage();
  } finally {
    if (previous === undefined) delete process.env.SCRAPBOOK_STORAGE_DIR;
    else process.env.SCRAPBOOK_STORAGE_DIR = previous;
  }
}

function isolatedStorage() {
  const root = path.join(testStorageRoot, `.cover-${randomUUID()}`);
  return { root, storage: atRoot(root) };
}

async function cleanup(root: string) {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== testStorageRoot ||
    !/^\.cover-[0-9a-f-]+$/.test(path.basename(resolved))
  )
    throw new Error(
      "Refusing to remove a directory outside cover test storage",
    );
  await rm(resolved, { recursive: true, force: true });
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function image(id: string, filename: string): ImageElement {
  return {
    id,
    type: "image",
    filename,
    caption: "A memory on the cover",
    frame: "polaroid",
    x: 80,
    y: 220,
    width: 140,
    height: 110,
    rotation: 13,
    crop: { x: 5, y: 10, width: 80, height: 75 },
    locked: true,
  };
}

async function uploadedImage(storage: LocalBookStorage) {
  const bytes = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: "#847056",
    },
  })
    .png()
    .toBuffer();
  const uploaded = await storage.saveImage(bytes, "image/png");
  return {
    filename: uploaded.filename,
    bytes: await storage.readImage(uploaded.filename),
  };
}

async function zipEntries(bytes: Buffer): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("Missing ZIP"));
      else resolve(file);
    });
  });
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Buffer>();
    zip.on("error", reject);
    zip.on("entry", (entry: yauzl.Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error("Missing ZIP entry"));
          zip.close();
          return;
        }
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.on("end", () => resolve(entries));
    zip.readEntry();
  });
}

async function archiveWithVersion(
  book: Book,
  images: Map<string, Buffer>,
  formatVersion: number,
) {
  const zip = new yazl.ZipFile();
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  zip.addBuffer(Buffer.from(JSON.stringify(book)), "book.json");
  zip.addBuffer(
    Buffer.from(
      JSON.stringify({
        format: "our-chronicle",
        formatVersion,
        exportedAt: new Date().toISOString(),
      }),
    ),
    "manifest.json",
  );
  for (const [filename, bytes] of images)
    zip.addBuffer(bytes, `images/${filename}`);
  zip.end();
  return output;
}

test("legacy cover defaults avoid existing IDs and custom covers obey global validation", () => {
  const legacy = createSampleBook();
  legacy.pages[0].id = "cover-default-title";
  legacy.pages[0].elements[0].id = "cover-default-topline";
  const before = JSON.stringify(legacy);
  const cover = resolveCover(legacy);
  expect(resolveCover(legacy)).toEqual(cover);
  expect(JSON.stringify(legacy)).toBe(before);
  expect(legacy.cover).toBeUndefined();
  expect(cover.elements.map((element) => element.id)).toContain(
    "cover-default-title-1",
  );
  expect(cover.elements.map((element) => element.id)).toContain(
    "cover-default-topline-1",
  );
  expect(bookSchema.safeParse({ ...legacy, cover }).success).toBe(true);
  expect(
    bookSchema.safeParse({
      ...legacy,
      cover: {
        ...cover,
        elements: [{ ...cover.elements[0], id: legacy.pages[0].id }],
      },
    }).success,
  ).toBe(false);
  expect(
    bookSchema.safeParse({
      ...legacy,
      cover: {
        ...cover,
        elements: [{ ...cover.elements[0], x: 350, width: 100 }],
      },
    }).success,
  ).toBe(false);
  expect(
    bookSchema.safeParse({
      ...legacy,
      cover: { ...cover, backgroundColor: "red" },
    }).success,
  ).toBe(false);
});

test("cover image sharing, protection, recovery and restart persist through portable import", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const uploaded = await uploadedImage(storage);
    const original = image("fresh-cover-photo", uploaded.filename);
    let book = await storage.saveBook({
      ...initial,
      cover: {
        ...resolveCover(initial),
        elements: [...resolveCover(initial).elements, original],
      },
      pages: initial.pages.map((page, index) =>
        index === 0
          ? {
              ...page,
              elements: [
                ...page.elements,
                { ...original, id: "shared-interior-photo" },
              ],
            }
          : page,
      ),
    });
    await expect(storage.deleteImage(uploaded.filename)).rejects.toMatchObject({
      status: 409,
    });
    expect(await atRoot(root).readBook()).toEqual(book);
    expect(hash(await atRoot(root).readImage(uploaded.filename))).toBe(
      hash(uploaded.bytes),
    );

    // Removing only one reference must leave the shared asset available.
    book = await storage.saveBook({
      ...book,
      cover: {
        ...book.cover!,
        elements: book.cover!.elements.filter(
          (element) => element.id !== original.id,
        ),
      },
    });
    expect(hash(await storage.readImage(uploaded.filename))).toBe(
      hash(uploaded.bytes),
    );
    book = await storage.saveBook({
      ...book,
      pages: book.pages.map((page) => ({
        ...page,
        elements: page.elements.filter(
          (element) => element.id !== "shared-interior-photo",
        ),
      })),
    });
    await expect(storage.readImage(uploaded.filename)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      hash(
        await readFile(path.join(root, "images", ".trash", uploaded.filename)),
      ),
    ).toBe(hash(uploaded.bytes));

    // A history restoration of a cover-only image recovers the original bytes.
    book = await storage.saveBook({
      ...book,
      cover: {
        ...book.cover!,
        elements: [...book.cover!.elements, original],
      },
    });
    await expect(storage.deleteImage(uploaded.filename)).rejects.toMatchObject({
      status: 409,
    });
    expect(hash(await storage.readImage(uploaded.filename))).toBe(
      hash(uploaded.bytes),
    );
    book = await storage.saveBook({
      ...book,
      pages: book.pages.map((page, index) =>
        index === 0
          ? {
              ...page,
              elements: [
                ...page.elements,
                { ...original, id: "shared-interior-photo" },
              ],
            }
          : page,
      ),
    });
    const archive = await storage.exportBook(book.revision);
    const exported = await decodeArchive(archive);
    expect(exported.book.cover).toEqual(book.cover);
    expect(hash(exported.images.get(uploaded.filename)!)).toBe(
      hash(uploaded.bytes),
    );
    const entries = await zipEntries(archive);
    expect(
      JSON.parse(entries.get("manifest.json")!.toString()).formatVersion,
    ).toBe(2);
    expect(
      [...entries.keys()].filter(
        (name) => name === `images/${uploaded.filename}`,
      ),
    ).toHaveLength(1);

    const imported = await storage.importBook(archive, book.revision);
    const importedImage = imported.book.cover!.elements.find(
      (element) => element.id === original.id,
    ) as ImageElement;
    const sharedImage = imported.book.pages[0].elements.find(
      (element) => element.id === "shared-interior-photo",
    ) as ImageElement;
    expect(importedImage.filename).not.toBe(uploaded.filename);
    expect(sharedImage.filename).toBe(importedImage.filename);
    expect({ ...importedImage, filename: uploaded.filename }).toEqual(original);
    expect(hash(await storage.readImage(importedImage.filename!))).toBe(
      hash(uploaded.bytes),
    );
    expect(await atRoot(root).readBook()).toEqual(imported.book);
  } finally {
    await cleanup(root);
  }
});

test("reset backs up customized cover data and cover-only image bytes before restoring defaults", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const uploaded = await uploadedImage(storage);
    const cover = resolveCover(initial);
    const custom = await storage.saveBook({
      ...initial,
      cover: {
        ...cover,
        style: "ivory",
        backgroundColor: "#e6ddcc",
        elements: [
          image("backup-cover-image", uploaded.filename),
          ...cover.elements.map((element) =>
            element.type === "text"
              ? {
                  ...element,
                  text: element.id.includes("title")
                    ? "A fresh cover memory"
                    : element.text,
                  color: "#554434",
                  bold: true,
                  italic: true,
                  rotation: -4,
                }
              : element,
          ),
        ],
      },
    });
    const reset = await storage.resetBook(custom.revision);
    expect(reset.book.cover).toBeUndefined();
    expect(resolveCover(reset.book)).toEqual(resolveCover(createSampleBook()));
    const backupBytes = await readFile(
      path.join(root, "backups", reset.backupFilename),
    );
    const backup = await decodeArchive(backupBytes);
    expect(backup.book).toEqual(custom);
    expect(hash(backup.images.get(uploaded.filename)!)).toBe(
      hash(uploaded.bytes),
    );
    const restored = await storage.importBook(backupBytes, reset.book.revision);
    const restoredCover = restored.book.cover!;
    const restoredImage = restoredCover.elements[0] as ImageElement;
    expect({
      ...restoredCover,
      elements: [
        { ...restoredImage, filename: uploaded.filename },
        ...restoredCover.elements.slice(1),
      ],
    }).toEqual(custom.cover);
    expect(hash(await storage.readImage(restoredImage.filename!))).toBe(
      hash(uploaded.bytes),
    );
    const activeFiles = (
      await readdir(path.join(root, "images"), { withFileTypes: true })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    expect(activeFiles).toEqual([...referencedImages(restored.book)].sort());
    expect(bookElements(restored.book)).toContainEqual(restoredImage);
  } finally {
    await cleanup(root);
  }
});

test("legacy archives remain version 1 and invalid cover format versions do not modify storage", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const legacyArchive = await storage.exportBook(initial.revision);
    const entries = await zipEntries(legacyArchive);
    expect(
      JSON.parse(entries.get("manifest.json")!.toString()).formatVersion,
    ).toBe(1);
    const decoded = await decodeArchive(legacyArchive);
    expect(decoded.book).toEqual(initial);
    const custom: Book = { ...initial, cover: resolveCover(initial) };
    const before = await readFile(path.join(root, "book.json"));
    await expect(
      storage.importBook(
        await archiveWithVersion(custom, decoded.images, 1),
        initial.revision,
      ),
    ).rejects.toThrow("Customized covers require a version 2");
    await expect(
      storage.importBook(
        await archiveWithVersion(custom, decoded.images, 4),
        initial.revision,
      ),
    ).rejects.toThrow("format version is not supported");
    expect(await readFile(path.join(root, "book.json"))).toEqual(before);
    expect(
      (await readdir(root)).filter(
        (name) => name === "backups" || name.startsWith(".incoming-"),
      ),
    ).toEqual([]);
  } finally {
    await cleanup(root);
  }
});
