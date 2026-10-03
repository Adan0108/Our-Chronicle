import { LocalBookStorage } from "./local";
import type { Book } from "@/types/book";

export interface BookStorage {
  readBook(): Promise<Book>;
  saveBook(book: Book): Promise<Book>;
  saveImage(
    bytes: Buffer,
    mime: string,
  ): Promise<{ filename: string; width: number; height: number }>;
  readImage(filename: string): Promise<Buffer>;
  deleteImage(filename: string): Promise<void>;
}
export class StorageError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const globalStorage = globalThis as typeof globalThis & {
  chronicleStorage?: BookStorage;
};
export const storage: BookStorage = (globalStorage.chronicleStorage ??=
  new LocalBookStorage());
