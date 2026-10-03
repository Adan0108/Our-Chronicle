import { z } from "zod";
import { storage, StorageError } from "@/lib/storage";
import { ARCHIVE_MAX_BYTES } from "@/lib/storage/archive";
import { apiError, checkOrigin, limitedBody } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (request.headers.get("x-confirm-replacement") !== "true")
      throw new StorageError(
        "Confirm that you want to replace the current book.",
      );
    const revisionHeader = request.headers.get("x-book-revision");
    if (revisionHeader === null)
      throw new StorageError("The current book revision is required.");
    const revision = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(revisionHeader);
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/zip"
    )
      throw new StorageError("Choose an Our Chronicle ZIP archive.", 415);
    const bytes = await limitedBody(request, ARCHIVE_MAX_BYTES);
    return Response.json(await storage.importBook(bytes, revision), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
