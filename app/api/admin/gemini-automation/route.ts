import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { listGeminiManualBackgroundJobs } from "@/lib/gemini-automation-background-queue";
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
      const [setting, job] = await Promise.all([
        getGeminiSetting(db, key),
        db.prepare(
          "SELECT id,stable_key,status,run_id,error_code,created_at,claimed_at,completed_at " +
          "FROM gemini_manual_background_jobs WHERE stable_key=? ORDER BY id DESC LIMIT 1"
        ).bind(key).first(),
      ]);
      return Response.json({ setting, job }, { headers: NO_STORE });
    }
    const [settings, runs, jobs] = await Promise.all([
      listGeminiSettings(db), listRecentGeminiRuns(db), listGeminiManualBackgroundJobs(db, 50),
    ]);
    return Response.json({ settings, runs, jobs }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Gemini konfigurácie nie sú dostupné. Over migrácie 0113 a 0126." }, { status: 503, headers: NO_STORE });
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
    return Response.json({ error: "Nastavenia sa nepodarilo uložiť. Over migrácie 0113 a 0126." }, { status: 503, headers: NO_STORE });
  }
}
