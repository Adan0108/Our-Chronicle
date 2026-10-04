import { LocalBookStorage } from "./local";
import type { Book } from "@/types/book";

export type BookReplacement = { book: Book; backupFilename: string };

export interface BookStorage {
  readBook(): Promise<Book>;
  saveBook(book: Book): Promise<Book>;
  saveImage(
    bytes: Buffer,
    mime: string,
  ): Promise<{ filename: string; width: number; height: number }>;
  readImage(filename: string): Promise<Buffer>;
  deleteImage(filename: string): Promise<void>;
  saveAudio(
    bytes: Buffer,
    mime: string,
  ): Promise<{ filename: string; duration: number }>;
  readAudio(filename: string): Promise<Buffer>;
  deleteAudio(filename: string): Promise<void>;
  exportBook(expectedRevision?: number): Promise<Buffer>;
  importBook(bytes: Buffer, expectedRevision: number): Promise<BookReplacement>;
  resetBook(expectedRevision: number): Promise<BookReplacement>;
}
export { StorageError } from "./errors";
const globalStorage = globalThis as typeof globalThis & {
  chronicleStorage?: BookStorage;
};
const cachedStorage = globalStorage.chronicleStorage;
if (
  cachedStorage &&
  !(cachedStorage instanceof LocalBookStorage) &&
  cachedStorage.constructor.name === LocalBookStorage.name
) {
  // Next dev can reload the adapter/model while retaining this global cache.
  // Refresh its methods in place so validation is current and its root/active
  // write queue stay shared by requests that began before and after the reload.
  Object.setPrototypeOf(cachedStorage, LocalBookStorage.prototype);
}
export const storage: BookStorage = (globalStorage.chronicleStorage ??=
  new LocalBookStorage());
