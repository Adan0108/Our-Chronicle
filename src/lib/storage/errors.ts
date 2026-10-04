// Server bundles and dev hot reloads can have separate constructor identities.
// A symbol cannot arrive through book JSON or uploaded archive metadata.
const storageErrorBrand = Symbol.for("our-chronicle.storage-error");

export class StorageError extends Error {
  private readonly [storageErrorBrand] = true;

  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function isStorageError(error: unknown): error is StorageError {
  if (!(error instanceof Error) || !Object.hasOwn(error, storageErrorBrand))
    return false;
  const candidate = error as Error & {
    [storageErrorBrand]?: unknown;
    status?: unknown;
  };
  return (
    candidate[storageErrorBrand] === true &&
    typeof candidate.message === "string" &&
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599
  );
}
