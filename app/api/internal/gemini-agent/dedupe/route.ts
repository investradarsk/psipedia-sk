import { env } from "cloudflare:workers";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { checkExternalGeminiIdentity } from "@/lib/gemini-external-dedupe";

export const dynamic = "force-dynamic";
/** Private HMAC-authenticated pre-Notion identity decision, no cookies or public data. */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ status: "BLOCKED" }, { status: 415, headers });
  try {
    const result = await checkExternalGeminiIdentity({
      db: requireGeminiAdminD1(),
      env: env as unknown as Parameters<typeof checkExternalGeminiIdentity>[0]["env"],
      body: await request.text(), signature: request.headers.get("x-psipedia-signature"),
    });
    return Response.json({ status: result.status }, { status: result.httpStatus, headers });
  } catch {
    return Response.json({ status: "BLOCKED" }, { status: 503, headers });
  }
}
