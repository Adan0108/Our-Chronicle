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
  exportBook(expectedRevision?: number): Promise<Buffer>;
  importBook(bytes: Buffer, expectedRevision: number): Promise<BookReplacement>;
  resetBook(expectedRevision: number): Promise<BookReplacement>;
}
export { StorageError } from "./errors";
const globalStorage = globalThis as typeof globalThis & {
  chronicleStorage?: BookStorage;
};
export const storage: BookStorage = (globalStorage.chronicleStorage ??=
  new LocalBookStorage());
