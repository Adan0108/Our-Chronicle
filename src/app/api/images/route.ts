import { storage, StorageError } from "@/lib/storage";
import { apiError, checkOrigin, limitedBody } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const bytes = await limitedBody(request, 10 * 1024 * 1024 + 64 * 1024);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") || "" },
      body: new Uint8Array(bytes),
    }).formData();
    const file = form.get("image");
    if (!(file instanceof File))
      throw new StorageError("Choose an image to upload");
    return Response.json(
      await storage.saveImage(Buffer.from(await file.arrayBuffer()), file.type),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
