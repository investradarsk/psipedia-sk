import { env } from "cloudflare:workers";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { authorizeGeminiExternalWorker } from "@/lib/gemini-global-control";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

/** Signed, single-use reservation immediately before an external paid run.
 * Never accepts admin cookies or a caller-provided API key as authorization. */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return Response.json({ ok: false }, { status: 415, headers: HEADERS });
  const secret = (env as unknown as { GEMINI_AGENT_CALLBACK_SECRET?: string }).GEMINI_AGENT_CALLBACK_SECRET;
  if (!secret) return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  const body = await request.text();
  const signature = request.headers.get("x-psipedia-signature") ?? "";
  if (body.length > 512 || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return Response.json({ ok: false }, { status: 401, headers: HEADERS });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const digest = Uint8Array.from(signature.slice(7).match(/.{2}/g) ?? [],
    value => parseInt(value, 16));
  if (!await crypto.subtle.verify("HMAC", key, digest, new TextEncoder().encode(body)))
    return Response.json({ ok: false }, { status: 401, headers: HEADERS });

  let input: unknown;
  try { input = JSON.parse(body); } catch { input = null; }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 2 ||
      !Number.isSafeInteger((input as { job_id?: unknown }).job_id) ||
      typeof (input as { stable_key?: unknown }).stable_key !== "string")
    return Response.json({ ok: false }, { status: 400, headers: HEADERS });
  try {
    const { job_id, stable_key } = input as { job_id: number; stable_key: string };
    const admitted = await authorizeGeminiExternalWorker({
      db: requireGeminiAdminD1(), jobId: job_id, stableKey: stable_key,
    });
    return Response.json({ ok: admitted }, { status: admitted ? 200 : 409, headers: HEADERS });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  }
}
