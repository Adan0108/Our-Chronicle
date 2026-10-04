import { storage, StorageError } from "@/lib/storage";
import { AUDIO_MAX_BYTES } from "@/lib/storage/audio";
import { apiError, checkOrigin, limitedBody } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const bytes = await limitedBody(request, AUDIO_MAX_BYTES + 64 * 1024);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") || "" },
      body: new Uint8Array(bytes),
    }).formData();
    const file = form.get("audio");
    if (!(file instanceof File))
      throw new StorageError("Choose an audio file to upload");
    // The filename supplied by the browser never becomes a filesystem path.
    return Response.json(
      await storage.saveAudio(Buffer.from(await file.arrayBuffer()), file.type),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
