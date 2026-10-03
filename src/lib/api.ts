import { ZodError } from "zod";
import { StorageError } from "./storage";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost; Host retains the browser's actual origin.
  const expected = new URL(request.url);
  expected.host = request.headers.get("host") || expected.host;
  if (origin && origin !== expected.origin)
    throw new StorageError("Cross-origin writes are not allowed", 403);
}
export async function limitedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new StorageError("Request body is required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new StorageError("Request is too large", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function apiError(error: unknown) {
  if (error instanceof StorageError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return Response.json(
      { error: "The book data is invalid." },
      { status: 400 },
    );
  console.error("Storage request failed:", error);
  return Response.json(
    {
      error:
        "Could not access local storage. Check that the storage folder is writable.",
    },
    { status: 500 },
  );
}
