import { env } from "cloudflare:workers";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { completeExternalGemini } from "@/lib/gemini-external-agent";

export const dynamic = "force-dynamic";

/** Machine-to-machine result endpoint; signed body only, no administrator cookies. */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ ok: false }, { status: 415 });
  try {
    const result = await completeExternalGemini({
      db: requireGeminiAdminD1() as D1Database,
      env: env as unknown as Parameters<typeof completeExternalGemini>[0]["env"],
      body: await request.text(),
      signature: request.headers.get("x-psipedia-signature"),
    });
    return Response.json({ ok: result.ok }, {
      status: result.status, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
