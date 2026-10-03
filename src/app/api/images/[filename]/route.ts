import { storage } from "@/lib/storage";
import { apiError, checkOrigin } from "@/lib/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ filename: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { filename } = await context.params;
    const bytes = await storage.readImage(filename);
    const type = filename.endsWith(".png")
      ? "image/png"
      : filename.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    await storage.deleteImage((await context.params).filename);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
