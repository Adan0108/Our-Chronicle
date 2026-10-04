import { storage } from "@/lib/storage";
import { audioMime } from "@/lib/storage/audio";
import { apiError, checkOrigin } from "@/lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ filename: string }> };

async function serve(request: Request, context: Context, head = false) {
  try {
    const { filename } = await context.params;
    const bytes = await storage.readAudio(filename);
    const headers = new Headers({
      "Content-Type": audioMime(filename),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    });
    let start = 0;
    let end = bytes.length - 1;
    let status = 200;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        headers.set("Content-Range", `bytes */${bytes.length}`);
        return new Response(null, { status: 416, headers });
      }
      if (!match[1]) {
        const suffix = Number(match[2]);
        start = bytes.length - Math.min(suffix, bytes.length);
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start < 0 ||
        start >= bytes.length
      ) {
        headers.set("Content-Range", `bytes */${bytes.length}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    }
    headers.set("Content-Length", String(end - start + 1));
    return new Response(
      head ? null : new Uint8Array(bytes.subarray(start, end + 1)),
      { status, headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request, context: Context) {
  return serve(request, context);
}

export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    await storage.deleteAudio((await context.params).filename);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
