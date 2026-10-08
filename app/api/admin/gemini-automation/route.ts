import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { GeminiSettingsValidationError, parseGeminiSettingsInput } from "@/lib/gemini-automation-admin-settings";
import {
  getGeminiSetting, listGeminiSettings, listRecentGeminiRuns,
  saveGeminiSetting,
} from "@/lib/gemini-automation-admin-store";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const key = new URL(request.url).searchParams.get("stable_key");
  if (key && !getGeminiCatalogItem(key)) {
    return Response.json({ error: "Neznáma podkategória." }, { status: 404, headers: NO_STORE });
  }
  try {
    const db = requireGeminiAdminD1();
    if (key) {
      return Response.json({ setting: await getGeminiSetting(db, key) }, { headers: NO_STORE });
    }
    const [settings, runs] = await Promise.all([listGeminiSettings(db), listRecentGeminiRuns(db)]);
    return Response.json({ settings, runs }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Gemini konfigurácie nie sú dostupné. Over migráciu 0113." }, { status: 503, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  try {
    const input = parseGeminiSettingsInput(await request.json().catch(() => null));
    const setting = await saveGeminiSetting(requireGeminiAdminD1(), input);
    return Response.json({ setting }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GeminiSettingsValidationError) {
      return Response.json({ error: error.message }, { status: 400, headers: NO_STORE });
    }
    return Response.json({ error: "Nastavenia sa nepodarilo uložiť. Over migráciu 0113." }, { status: 503, headers: NO_STORE });
  }
}
