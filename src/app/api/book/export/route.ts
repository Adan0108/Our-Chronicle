import { z } from "zod";
import { storage } from "@/lib/storage";
import { apiError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const revision = new URL(request.url).searchParams.get("revision");
    const expected =
      revision === null
        ? undefined
        : z.coerce.number().int().nonnegative().parse(revision);
    const bytes = await storage.exportBook(expected);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="our-chronicle-${date}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
