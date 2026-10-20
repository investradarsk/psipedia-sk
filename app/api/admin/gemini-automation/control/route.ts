import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { getGeminiGlobalControl, setGeminiGlobalStop, GeminiGlobalControlError } from "@/lib/gemini-global-control";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store" };

export async function GET() {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    return Response.json({ control: await getGeminiGlobalControl(requireGeminiAdminD1()) }, { headers: HEADERS });
  } catch {
    return Response.json({ error: "Globálne ovládanie nie je dostupné. Over neschválenú migráciu 0136." },
      { status: 503, headers: HEADERS });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: HEADERS });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).stopped !== "boolean") {
    return Response.json({ error: "Povolené je iba { stopped: boolean }." },
      { status: 400, headers: HEADERS });
  }
  try {
    const stopped = (body as { stopped: boolean }).stopped;
    const control = await setGeminiGlobalStop(requireGeminiAdminD1() as D1Database, stopped);
    return Response.json({ control }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof GeminiGlobalControlError && error.code === "CONFLICT") {
      return Response.json({ error: "Stav sa súbežne zmenil. Obnov stránku." },
        { status: 409, headers: HEADERS });
    }
    return Response.json({ error: "Zmena hlavného STOP nebola potvrdená. Stav over obnovením stránky." },
      { status: 503, headers: HEADERS });
  }
}
