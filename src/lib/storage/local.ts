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
  rm,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  bookSchema,
  imageNameSchema,
  audioNameSchema,
  type Book,
  type BookElement,
} from "@/types/book";
import { bookElements } from "@/lib/cover";
import { createSampleBook, sampleArtwork } from "./sample";
import type { BookReplacement, BookStorage } from "./index";
import { isStorageError, StorageError } from "./errors";
import {
  CONTENT_MAX_BYTES,
  decodeArchive,
  encodeArchive,
  referencedImages,
  referencedAudio,
  validateImage,
} from "./archive";
import { AUDIO_MAX_BYTES, audioExtension, validateAudio } from "./audio";

const TRASH_LIMIT = 3000;
const TRASH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const AUDIO_TRASH_LIMIT = 100;

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
  private audioPath(filename: string) {
    if (!audioNameSchema.safeParse(filename).success)
      throw new StorageError("Invalid audio name");
    return path.join(this.root, "audio", filename);
  }
  private audioTrashPath(filename: string) {
    this.audioPath(filename);
    return path.join(this.root, "audio", ".trash", filename);
  }
  private async ensureAudio(filename: string) {
    try {
      await access(this.audioPath(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await copyFile(
          this.audioTrashPath(filename),
          this.audioPath(filename),
          constants.COPYFILE_EXCL,
        );
      } catch (restoreError) {
        if ((restoreError as NodeJS.ErrnoException).code !== "EEXIST")
          throw new StorageError(
            "An audio file is missing. Please upload it again.",
          );
      }
    }
  }
  private async archiveAudio(filenames: Set<string>) {
    if (!filenames.size) return;
    await mkdir(path.join(this.root, "audio", ".trash"), { recursive: true });
    for (const filename of filenames) {
      try {
        await copyFile(this.audioPath(filename), this.audioTrashPath(filename));
        const removedAt = new Date();
        await utimes(this.audioTrashPath(filename), removedAt, removedAt);
        await unlink(this.audioPath(filename));
      } catch {
        // Failed cleanup leaves the previous audio available on disk.
      }
    }
  }
  private async pruneAudioTrash() {
    const directory = path.join(this.root, "audio", ".trash");
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && audioNameSchema.safeParse(entry.name).success,
        )
        .map(async (entry) => ({
          filename: entry.name,
          modified: (await stat(this.audioTrashPath(entry.name))).mtimeMs,
        })),
    );
    files.sort((a, b) => b.modified - a.modified);
    const cutoff = Date.now() - TRASH_MAX_AGE;
    for (let index = 0; index < files.length; index++)
      if (index >= AUDIO_TRASH_LIMIT || files[index].modified < cutoff)
        await unlink(this.audioTrashPath(files[index].filename)).catch(
          () => undefined,
        );
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
  private checkRevision(book: Book, expected: number) {
    if (book.revision !== expected)
      throw new StorageError(
        "This book changed in another tab. Reload to get the latest version.",
        409,
      );
  }
  private async bookImages(book: Book) {
    const images = new Map<string, Buffer>();
    let total = 0;
    for (const filename of referencedImages(book)) {
      const info = await stat(this.imagePath(filename)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new StorageError(
            `Image ${filename} is missing. Restore it before exporting.`,
          );
        throw error;
      });
      if (info.size > 10 * 1024 * 1024 || total + info.size > CONTENT_MAX_BYTES)
        throw new StorageError(
          "The book exceeds the image or archive size limits.",
          413,
        );
      const bytes = await this.readImage(filename);
      total += bytes.length;
      if (bytes.length > 10 * 1024 * 1024 || total > CONTENT_MAX_BYTES)
        throw new StorageError(
          "The book exceeds the image or archive size limits.",
          413,
        );
      images.set(filename, bytes);
    }
    return images;
  }
  private async safetyBackup(book: Book, reason: "import" | "reset") {
    const bytes = await encodeArchive(
      book,
      await this.bookImages(book),
      await this.bookAudio(book),
    );
    const directory = path.join(this.root, "backups");
    await mkdir(directory, { recursive: true });
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `our-chronicle-${date}-before-${reason}-${randomUUID()}.zip`;
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, path.join(directory, filename));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return filename;
  }
  private async bookAudio(book: Book) {
    const audio = new Map<string, Buffer>();
    for (const filename of referencedAudio(book)) {
      const info = await stat(this.audioPath(filename)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new StorageError(
            `Audio ${filename} is missing. Restore it before exporting.`,
          );
        throw error;
      });
      if (info.size > AUDIO_MAX_BYTES)
        throw new StorageError("Audio files must be smaller than 20 MB.", 413);
      const bytes = await this.readAudio(filename);
      if (bytes.length > AUDIO_MAX_BYTES)
        throw new StorageError("Audio files must be smaller than 20 MB.", 413);
      audio.set(filename, bytes);
    }
    return audio;
  }
  private async replaceBook(
    previous: Book,
    incoming: Book,
    images: Map<string, Buffer>,
    audio: Map<string, Buffer>,
    reason: "import" | "reset",
  ): Promise<BookReplacement> {
    // Archive paths never become filesystem paths. New names also prevent stale
    // immutable browser image caches from showing a different book's photograph.
    const names = new Map(
      [...images.keys()].map((filename) => [
        filename,
        `${randomUUID()}${path.extname(filename)}`,
      ]),
    );
    const remapElement = (element: BookElement): BookElement =>
      element.type === "image" && element.filename
        ? { ...element, filename: names.get(element.filename) }
        : element;
    const audioNames = new Map(
      [...audio.keys()].map((filename) => [
        filename,
        `${randomUUID()}${path.extname(filename)}`,
      ]),
    );
    const saved = bookSchema.parse({
      ...incoming,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
      ...(incoming.audio
        ? {
            audio: {
              ...incoming.audio,
              filename: audioNames.get(incoming.audio.filename),
            },
          }
        : {}),
      ...(incoming.cover
        ? {
            cover: {
              ...incoming.cover,
              elements: incoming.cover.elements.map(remapElement),
            },
          }
        : {}),
      pages: incoming.pages.map((page) => ({
        ...page,
        elements: page.elements.map(remapElement),
      })),
    });
    // If backup creation fails, no current book/image content has been touched.
    const backupFilename = await this.safetyBackup(previous, reason);
    const stage = path.join(this.root, `.incoming-${randomUUID()}`);
    const promoted: string[] = [];
    const promotedAudio: string[] = [];
    let committed = false;
    try {
      await mkdir(stage);
      for (const [original, bytes] of images) {
        const filename = names.get(original)!;
        await writeFile(path.join(stage, filename), bytes, { flag: "wx" });
      }
      for (const filename of names.values()) {
        await copyFile(
          path.join(stage, filename),
          this.imagePath(filename),
          constants.COPYFILE_EXCL,
        );
        promoted.push(filename);
      }
      for (const [original, bytes] of audio) {
        const filename = audioNames.get(original)!;
        await writeFile(path.join(stage, filename), bytes, { flag: "wx" });
        await copyFile(
          path.join(stage, filename),
          this.audioPath(filename),
          constants.COPYFILE_EXCL,
        );
        promotedAudio.push(filename);
      }
      // Commit only after every new image exists. Until this rename, the old
      // book still references untouched original files, including after a crash.
      await this.atomicWrite(saved);
      committed = true;
      const kept = referencedImages(saved);
      const entries = await readdir(path.join(this.root, "images"), {
        withFileTypes: true,
      }).catch(() => []);
      const removed = new Set(
        entries
          .filter(
            (entry) =>
              entry.isFile() &&
              imageNameSchema.safeParse(entry.name).success &&
              !kept.has(entry.name),
          )
          .map((entry) => entry.name),
      );
      // Cleanup happens after commit; existing undo recovery remains bounded.
      await this.archiveImages(removed).catch(() => undefined);
      await this.pruneTrash().catch(() => undefined);
      const keptAudio = referencedAudio(saved);
      const audioEntries = await readdir(path.join(this.root, "audio"), {
        withFileTypes: true,
      }).catch(() => []);
      await this.archiveAudio(
        new Set(
          audioEntries
            .filter(
              (entry) =>
                entry.isFile() &&
                audioNameSchema.safeParse(entry.name).success &&
                !keptAudio.has(entry.name),
            )
            .map((entry) => entry.name),
        ),
      ).catch(() => undefined);
      await this.pruneAudioTrash().catch(() => undefined);
      return { book: saved, backupFilename };
    } finally {
      if (!committed)
        for (const filename of promoted)
          await unlink(this.imagePath(filename)).catch(() => undefined);
      if (!committed)
        for (const filename of promotedAudio)
          await unlink(this.audioPath(filename)).catch(() => undefined);
      // This is an internally generated direct child, never an imported path.
      if (
        path.dirname(stage) === this.root &&
        /^\.incoming-[0-9a-f-]+$/.test(path.basename(stage))
      )
        await rm(stage, { recursive: true, force: true }).catch(
          () => undefined,
        );
    }
  }
  private async readOrCreate(): Promise<Book> {
    await mkdir(path.join(this.root, "images"), { recursive: true });
    await mkdir(path.join(this.root, "audio"), { recursive: true });
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
  exportBook(expectedRevision?: number) {
    return this.locked(async () => {
      const book = await this.readOrCreate();
      if (expectedRevision !== undefined)
        this.checkRevision(book, expectedRevision);
      return encodeArchive(
        book,
        await this.bookImages(book),
        await this.bookAudio(book),
      );
    });
  }
  async importBook(bytes: Buffer, expectedRevision: number) {
    // Validation/decompression finishes before taking the write queue or making
    // a backup. Invalid input never modifies the current scrapbook.
    const imported = await decodeArchive(bytes);
    return this.locked(async () => {
      const previous = await this.readOrCreate();
      this.checkRevision(previous, expectedRevision);
      return this.replaceBook(
        previous,
        imported.book,
        imported.images,
        imported.audio,
        "import",
      );
    });
  }
  resetBook(expectedRevision: number) {
    return this.locked(async () => {
      const previous = await this.readOrCreate();
      this.checkRevision(previous, expectedRevision);
      const book = bookSchema.parse(createSampleBook());
      const images = new Map<string, Buffer>();
      for (const filename of referencedImages(book)) {
        let bytes: Buffer;
        try {
          bytes = await this.readImage(filename);
        } catch (error) {
          if (!isStorageError(error) || error.status !== 404) throw error;
          try {
            bytes = await readFile(this.trashPath(filename));
          } catch (archiveError) {
            if ((archiveError as NodeJS.ErrnoException).code !== "ENOENT")
              throw archiveError;
            // The same built-in artwork used by first-run initialization keeps
            // reset usable even if old sample files were removed or expired.
            const artwork =
              sampleArtwork[filename as keyof typeof sampleArtwork];
            if (!artwork)
              throw new StorageError("Sample photograph is missing", 500);
            bytes = await sharp(Buffer.from(artwork))
              .jpeg({ quality: 90 })
              .toBuffer();
          }
        }
        try {
          await validateImage(filename, bytes);
        } catch (error) {
          if (!isStorageError(error)) throw error;
          const artwork = sampleArtwork[filename as keyof typeof sampleArtwork];
          if (!artwork) throw error;
          bytes = await sharp(Buffer.from(artwork))
            .jpeg({ quality: 90 })
            .toBuffer();
        }
        images.set(filename, bytes);
      }
      return this.replaceBook(previous, book, images, new Map(), "reset");
    });
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
      for (const el of bookElements(book))
        if (el.type === "image" && el.filename)
          await this.ensureImage(el.filename);
      if (book.audio) await this.ensureAudio(book.audio.filename);
      const saved = {
        ...book,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.atomicWrite(saved);
      const kept = referencedImages(saved);
      const removed = new Set(
        [...referencedImages(previous)].filter(
          (filename) => !kept.has(filename),
        ),
      );
      // Commit first; archive/cleanup failures cannot invalidate a successful save.
      await this.archiveImages(removed).catch(() => undefined);
      await this.pruneTrash().catch(() => undefined);
      const keptAudio = referencedAudio(saved);
      await this.archiveAudio(
        new Set(
          [...referencedAudio(previous)].filter(
            (filename) => !keptAudio.has(filename),
          ),
        ),
      ).catch(() => undefined);
      await this.pruneAudioTrash().catch(() => undefined);
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
        // Alpha assets remain lossless; there is deliberately no flatten step.
        .webp({ quality: 88, lossless: metadata.hasAlpha })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new StorageError(
        "This image cannot be read. Use a valid JPEG, PNG, or WebP under 24 megapixels.",
      );
    }
    if (result.data.length > 10 * 1024 * 1024)
      throw new StorageError(
        "The processed image exceeds 10 MB. Choose a smaller image.",
        413,
      );
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
        bookElements(book).some(
          (el) => el.type === "image" && el.filename === filename,
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
  async saveAudio(bytes: Buffer, mime: string) {
    const extension = audioExtension(mime);
    const filename = `${randomUUID()}.${extension}`;
    const { duration } = await validateAudio(filename, bytes);
    await mkdir(path.join(this.root, "audio"), { recursive: true });
    await writeFile(this.audioPath(filename), bytes, { flag: "wx" });
    return { filename, duration };
  }
  async readAudio(filename: string) {
    try {
      return await readFile(this.audioPath(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new StorageError("Audio not found", 404);
      throw error;
    }
  }
  deleteAudio(filename: string) {
    return this.locked(async () => {
      const book = await this.readOrCreate();
      if (book.audio?.filename === filename)
        throw new StorageError(
          "Remove this audio from the book before deleting its file.",
          409,
        );
      await unlink(this.audioPath(filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      await unlink(this.audioTrashPath(filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    });
  }
}
