import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  access,
  copyFile,
  readdir,
  stat,
  utimes,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { bookSchema, imageNameSchema, type Book } from "@/types/book";
import { createSampleBook, sampleArtwork } from "./sample";
import { StorageError, type BookStorage } from "./index";

const TRASH_LIMIT = 3000;
const TRASH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export class LocalBookStorage implements BookStorage {
  // User files are accessed at runtime, never bundled into the application output.
  private root = path.resolve(
    /* turbopackIgnore: true */ process.env.SCRAPBOOK_STORAGE_DIR || "storage",
  );
  private queue: Promise<unknown> = Promise.resolve();
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(fn);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private imagePath(filename: string) {
    if (!imageNameSchema.safeParse(filename).success)
      throw new StorageError("Invalid image name");
    return path.join(this.root, "images", filename);
  }
  private trashPath(filename: string) {
    this.imagePath(filename);
    return path.join(this.root, "images", ".trash", filename);
  }
  private async ensureImage(filename: string) {
    const active = this.imagePath(filename);
    try {
      await access(active);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Retain the archive until a book commit succeeds, including failed saves.
      try {
        await copyFile(
          this.trashPath(filename),
          active,
          constants.COPYFILE_EXCL,
        );
      } catch (restoreError) {
        if ((restoreError as NodeJS.ErrnoException).code !== "EEXIST")
          throw new StorageError(
            "An image is missing. Please upload it again.",
          );
      }
    }
  }
  private async archiveImages(filenames: Set<string>) {
    if (!filenames.size) return;
    await mkdir(path.join(this.root, "images", ".trash"), { recursive: true });
    for (const filename of filenames) {
      try {
        await copyFile(this.imagePath(filename), this.trashPath(filename));
        // Retention starts when removed, even if the source photo has an old mtime.
        const removedAt = new Date();
        await utimes(this.trashPath(filename), removedAt, removedAt);
        await unlink(this.imagePath(filename));
      } catch {
        // A failed archive leaves the original image recoverable on disk.
      }
    }
  }
  private async pruneTrash() {
    const directory = path.join(this.root, "images", ".trash");
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && imageNameSchema.safeParse(entry.name).success,
        )
        .map(async (entry) => ({
          filename: entry.name,
          modified: (await stat(this.trashPath(entry.name))).mtimeMs,
        })),
    );
    const cutoff = Date.now() - TRASH_MAX_AGE;
    files.sort((a, b) => b.modified - a.modified);
    for (let index = 0; index < files.length; index++)
      if (index >= TRASH_LIMIT || files[index].modified < cutoff)
        await unlink(this.trashPath(files[index].filename)).catch(
          () => undefined,
        );
  }
  private async atomicWrite(book: Book) {
    const temporary = path.join(this.root, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(book, null, 2) + "\n", {
        flag: "wx",
      });
      await rename(temporary, path.join(this.root, "book.json"));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  private async readOrCreate(): Promise<Book> {
    await mkdir(path.join(this.root, "images"), { recursive: true });
    try {
      return bookSchema.parse(
        JSON.parse(await readFile(path.join(this.root, "book.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      for (const [filename, svg] of Object.entries(sampleArtwork)) {
        try {
          await access(this.imagePath(filename));
        } catch {
          await sharp(Buffer.from(svg))
            .jpeg({ quality: 90 })
            .toFile(this.imagePath(filename));
        }
      }
      const book = bookSchema.parse(createSampleBook());
      await this.atomicWrite(book);
      return book;
    }
  }
  readBook() {
    return this.locked(() => this.readOrCreate());
  }
  saveBook(incoming: Book) {
    return this.locked(async () => {
      const book = bookSchema.parse(incoming);
      const previous = await this.readOrCreate();
      if (book.revision !== previous.revision)
        throw new StorageError(
          "This book changed in another tab. Reload to get the latest version.",
          409,
        );
      for (const page of book.pages)
        for (const el of page.elements) {
          if (el.type === "image" && el.filename)
            await this.ensureImage(el.filename);
        }
      const saved = {
        ...book,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.atomicWrite(saved);
      const kept = new Set(
        saved.pages.flatMap((p) =>
          p.elements.flatMap((el) =>
            el.type === "image" && el.filename ? [el.filename] : [],
          ),
        ),
      );
      const removed = new Set(
        previous.pages.flatMap((p) =>
          p.elements.flatMap((el) =>
            el.type === "image" && el.filename && !kept.has(el.filename)
              ? [el.filename]
              : [],
          ),
        ),
      );
      // Commit first; archive/cleanup failures cannot invalidate a successful save.
      await this.archiveImages(removed).catch(() => undefined);
      await this.pruneTrash().catch(() => undefined);
      return saved;
    });
  }
  async saveImage(bytes: Buffer, mime: string) {
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new StorageError("Images must be smaller than 10 MB.", 413);
    const formats: Record<string, string> = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (!formats[mime])
      throw new StorageError("Choose a JPEG, PNG, or WebP image.", 415);
    let result;
    try {
      const input = sharp(bytes, {
        limitInputPixels: 24_000_000,
        animated: false,
      });
      const metadata = await input.metadata();
      if (metadata.format !== formats[mime])
        throw new Error("Mismatched image format");
      result = await input
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new StorageError(
        "This image cannot be read. Use a valid JPEG, PNG, or WebP under 24 megapixels.",
      );
    }
    await mkdir(path.join(this.root, "images"), { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(this.imagePath(filename), result.data, { flag: "wx" });
    return { filename, width: result.info.width, height: result.info.height };
  }
  async readImage(filename: string) {
    try {
      return await readFile(this.imagePath(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new StorageError("Image not found", 404);
      throw error;
    }
  }
  deleteImage(filename: string) {
    return this.locked(async () => {
      const book = await this.readOrCreate();
      if (
        book.pages.some((p) =>
          p.elements.some(
            (el) => el.type === "image" && el.filename === filename,
          ),
        )
      )
        throw new StorageError(
          "Remove this image from the book before deleting its file.",
          409,
        );
      await unlink(this.imagePath(filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      await unlink(this.trashPath(filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    });
  }
}
