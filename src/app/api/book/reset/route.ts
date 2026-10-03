import { z } from "zod";
import { storage } from "@/lib/storage";
import { apiError, checkOrigin, limitedBody } from "@/lib/api";
export const runtime = "nodejs";
const resetSchema = z.object({
  revision: z.number().int().nonnegative(),
  confirm: z.literal(true),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { revision } = resetSchema.parse(
      JSON.parse((await limitedBody(request, 1024)).toString("utf8")),
    );
    return Response.json(await storage.resetBook(revision), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
