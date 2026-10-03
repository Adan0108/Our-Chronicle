import type { Readable } from "node:stream";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import * as yauzl from "yauzl";
import { ZipFile } from "yazl";
import { z } from "zod";
import { bookSchema, imageNameSchema, type Book } from "@/types/book";
import { bookElements } from "@/lib/cover";
import { StorageError } from "./errors";

// v1 ships ESM declarations with a CommonJS export assignment; load its CJS API.
const crc32 = createRequire(path.join(process.cwd(), "package.json"))(
  "buffer-crc32",
) as {
  unsigned(bytes: Buffer, previous?: number): number;
};

export const ARCHIVE_MAX_BYTES = 250 * 1024 * 1024;
export const CONTENT_MAX_BYTES = 500 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BOOK_MAX_BYTES = 1024 * 1024;
const MANIFEST_MAX_BYTES = 16 * 1024;
const ENTRY_LIMIT = 6063;
const PIXEL_LIMIT = 24_000_000;
const manifestSchema = z.object({
  format: z.literal("our-chronicle"),
  formatVersion: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.iso.datetime(),
});

export function referencedImages(book: Book): Set<string> {
  return new Set(
    bookElements(book).flatMap((element) =>
      element.type === "image" && element.filename ? [element.filename] : [],
    ),
  );
}

function parseJson(bytes: Buffer, filename: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new StorageError(`The archive contains an invalid ${filename}.`);
  }
}

function parseBook(value: unknown): Book {
  const result = bookSchema.safeParse(value);
  if (!result.success)
    throw new StorageError(
      "The archive contains invalid or unsupported book.json data.",
    );
  return result.data;
}

function validateManifest(bytes: Buffer) {
  const value = parseJson(bytes, "manifest.json");
  if (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === "our-chronicle" &&
    "formatVersion" in value &&
    value.formatVersion !== 1 &&
    value.formatVersion !== 2
  )
    throw new StorageError(
      "This archive format version is not supported. Choose a version 1 or 2 Our Chronicle export.",
    );
  const manifest = manifestSchema.safeParse(value);
  if (!manifest.success)
    throw new StorageError(
      "Choose an Our Chronicle export with a valid manifest.json.",
    );
  return manifest.data;
}

function isAnimatedPng(bytes: Buffer): boolean {
  // libvips may expose only the first APNG frame. Inspect PNG chunk names as well.
  if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    if (length > bytes.length - offset - 12) break;
    offset += length + 12;
  }
  return false;
}

export async function validateImage(filename: string, bytes: Buffer) {
  if (!imageNameSchema.safeParse(filename).success)
    throw new StorageError("The archive contains an unsafe image filename.");
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES)
    throw new StorageError(
      `Image ${filename} must be smaller than 10 MB.`,
      413,
    );
  const expectedFormat = filename.endsWith(".jpg")
    ? "jpeg"
    : filename.endsWith(".png")
      ? "png"
      : "webp";
  try {
    const image = sharp(bytes, {
      limitInputPixels: PIXEL_LIMIT,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > PIXEL_LIMIT ||
      (metadata.pages ?? 1) !== 1 ||
      isAnimatedPng(bytes)
    )
      throw new Error("Unsupported image");
    // Metadata alone does not decode pixels or catch truncated/corrupted images.
    await image.stats();
  } catch {
    throw new StorageError(
      `Image ${filename} cannot be read. Use a non-animated JPEG, PNG, or WebP under 24 megapixels with a matching filename extension.`,
    );
  }
}

async function collectOutput(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > ARCHIVE_MAX_BYTES)
      throw new StorageError("Book archives must be smaller than 250 MB.", 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export async function encodeArchive(
  incoming: Book,
  images: Map<string, Buffer>,
): Promise<Buffer> {
  const book = parseBook(incoming);
  const bookBytes = Buffer.from(JSON.stringify(book, null, 2) + "\n");
  if (bookBytes.length > BOOK_MAX_BYTES)
    throw new StorageError(
      "Book JSON must be smaller than 1 MB to export.",
      413,
    );
  const manifestBytes = Buffer.from(
    JSON.stringify(
      {
        format: "our-chronicle",
        formatVersion: book.cover ? 2 : 1,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  const filenames = [...referencedImages(book)].sort();
  let total = bookBytes.length + manifestBytes.length;
  for (const filename of filenames) {
    const bytes = images.get(filename);
    if (!bytes)
      throw new StorageError(
        `Image ${filename} is missing. Restore it before exporting.`,
      );
    total += bytes.length;
    if (total > CONTENT_MAX_BYTES)
      throw new StorageError(
        "The book exceeds the 500 MB uncompressed archive limit.",
        413,
      );
    await validateImage(filename, bytes);
  }

  const archive = new ZipFile();
  const output = archive.outputStream as Readable;
  archive.on("error", (error: Error) => output.destroy(error));
  const result = collectOutput(output);
  archive.addBuffer(bookBytes, "book.json", { compressionLevel: 9 });
  archive.addBuffer(manifestBytes, "manifest.json", { compressionLevel: 9 });
  for (const filename of filenames)
    archive.addBuffer(images.get(filename)!, `images/${filename}`, {
      compress: false,
    });
  archive.end();
  return result;
}

function entryLimit(entry: yauzl.Entry): number {
  const filename = entry.fileName;
  if (filename === "book.json") return BOOK_MAX_BYTES;
  if (filename === "manifest.json") return MANIFEST_MAX_BYTES;
  if (filename === "images/") return 0;
  if (
    filename.startsWith("images/") &&
    imageNameSchema.safeParse(filename.slice("images/".length)).success
  )
    return IMAGE_MAX_BYTES;
  throw new StorageError(
    "The archive contains an unsafe path or unexpected file. Only book.json, manifest.json, and referenced images are allowed.",
  );
}

function validateEntry(entry: yauzl.Entry, seen: Set<string>): number {
  const filename = entry.fileName;
  const folded = filename.toLowerCase();
  if (seen.has(folded))
    throw new StorageError(
      "The archive contains duplicate or conflicting paths.",
    );
  seen.add(folded);
  if (
    filename.includes("\\") ||
    filename.startsWith("/") ||
    filename.split("/").some((part) => part === "." || part === "..") ||
    /^[a-z]:/i.test(filename)
  )
    throw new StorageError("The archive contains an unsafe ZIP path.");
  const limit = entryLimit(entry);
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  const directory = filename === "images/";
  if (
    (entry.generalPurposeBitFlag & 0x41) !== 0 ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
    (mode !== 0 && mode !== (directory ? 0o040000 : 0o100000)) ||
    (!directory && (entry.externalFileAttributes & 0x10) !== 0)
  )
    throw new StorageError(
      "Encrypted archives, links, and special ZIP entries are not supported.",
    );
  for (const size of [entry.compressedSize, entry.uncompressedSize])
    if (!Number.isSafeInteger(size) || size < 0)
      throw new StorageError("The archive contains invalid entry sizes.");
  if (
    entry.uncompressedSize > limit ||
    (!directory && entry.uncompressedSize === 0)
  )
    throw new StorageError(
      `Archive entry ${filename} is empty or exceeds its size limit.`,
      413,
    );
  return limit;
}

export async function decodeArchive(
  bytes: Buffer,
): Promise<{ book: Book; images: Map<string, Buffer> }> {
  if (!bytes.length || bytes.length > ARCHIVE_MAX_BYTES)
    throw new StorageError("Choose a ZIP archive smaller than 250 MB.", 413);
  let zip: yauzl.ZipFile;
  try {
    zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.fromBuffer(
        bytes,
        { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
        (error, file) => {
          if (error || !file) reject(error ?? new Error("Invalid ZIP"));
          else resolve(file);
        },
      );
    });
  } catch {
    throw new StorageError("This file is not a readable ZIP archive.");
  }
  if (zip.entryCount > ENTRY_LIMIT) {
    zip.close();
    throw new StorageError("The archive contains too many entries.", 413);
  }

  return new Promise((resolve, reject) => {
    const entries = new Map<string, Buffer>();
    const seen = new Set<string>();
    let compressed = 0;
    let uncompressed = 0;
    let actual = 0;
    let settled = false;
    let activeStream: Readable | undefined;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      activeStream?.destroy();
      zip.close();
      reject(
        error instanceof StorageError
          ? error
          : new StorageError("The ZIP archive is malformed or corrupted."),
      );
    };
    const readEntry = async (entry: yauzl.Entry) => {
      const limit = validateEntry(entry, seen);
      compressed += entry.compressedSize;
      uncompressed += entry.uncompressedSize;
      if (
        seen.size > ENTRY_LIMIT ||
        compressed > ARCHIVE_MAX_BYTES ||
        uncompressed > CONTENT_MAX_BYTES
      )
        throw new StorageError("The archive exceeds its size limits.", 413);
      const stream = await new Promise<Readable>((done, rejectStream) => {
        zip.openReadStream(entry, (error, opened) => {
          if (error || !opened)
            rejectStream(error ?? new Error("Unreadable ZIP entry"));
          else done(opened);
        });
      });
      activeStream = stream;
      const chunks: Buffer[] = [];
      let size = 0;
      let checksum = 0;
      for await (const chunk of stream) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += data.length;
        actual += data.length;
        if (size > limit || actual > CONTENT_MAX_BYTES)
          throw new StorageError("The archive exceeds its size limits.", 413);
        checksum = crc32.unsigned(data, checksum);
        chunks.push(data);
      }
      activeStream = undefined;
      if (size !== entry.uncompressedSize || checksum !== entry.crc32)
        throw new StorageError("The ZIP archive is malformed or corrupted.");
      entries.set(entry.fileName, Buffer.concat(chunks, size));
    };
    zip.on("error", fail);
    zip.on("entry", (entry: yauzl.Entry) => {
      void readEntry(entry).then(() => {
        if (!settled) zip.readEntry();
      }, fail);
    });
    zip.on("end", () => {
      void (async () => {
        const manifestBytes = entries.get("manifest.json");
        const bookBytes = entries.get("book.json");
        if (!manifestBytes || !bookBytes)
          throw new StorageError(
            "The archive must contain book.json and manifest.json.",
          );
        const manifest = validateManifest(manifestBytes);
        const book = parseBook(parseJson(bookBytes, "book.json"));
        if (book.cover && manifest.formatVersion !== 2)
          throw new StorageError(
            "Customized covers require a version 2 Our Chronicle archive.",
          );
        const references = referencedImages(book);
        const images = new Map<string, Buffer>();
        for (const [filename, data] of entries) {
          if (!filename.startsWith("images/") || filename === "images/")
            continue;
          const imageName = filename.slice("images/".length);
          if (!references.has(imageName))
            throw new StorageError(
              "The archive contains images that are not referenced by the book.",
            );
          await validateImage(imageName, data);
          images.set(imageName, data);
        }
        for (const filename of references)
          if (!images.has(filename))
            throw new StorageError(`The archive is missing image ${filename}.`);
        if (!settled) {
          settled = true;
          zip.close();
          resolve({ book, images });
        }
      })().catch(fail);
    });
    zip.readEntry();
  });
}
