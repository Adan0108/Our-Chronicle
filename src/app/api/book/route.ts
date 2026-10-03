import { storage } from "@/lib/storage";
import { bookSchema } from "@/types/book";
import { apiError, checkOrigin, limitedBody } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await storage.readBook(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const book = bookSchema.parse(
      JSON.parse((await limitedBody(request, 1024 * 1024)).toString("utf8")),
    );
    return Response.json(await storage.saveBook(book));
  } catch (error) {
    return apiError(error);
  }
}
