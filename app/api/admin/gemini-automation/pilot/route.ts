import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import {
  GeminiPilotGuardError, parseGeminiPilotBody, runGeminiDirectoryPilot,
} from "@/lib/gemini-automation-pilot";
import type { GeminiRuntimeConfig } from "@/lib/gemini-automation-types";
import type { NotionDirectorySyncBindings } from "@/lib/notion-directory-sync";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  try {
    const { stableKey } = parseGeminiPilotBody(await request.json().catch(() => null));
    const result = await runGeminiDirectoryPilot({
      database: requireGeminiAdminD1() as D1Database,
      env: env as unknown as GeminiRuntimeConfig & NotionDirectorySyncBindings,
      stableKey,
    });
    if (result.status === "FAILED") {
      return Response.json({
        error: "Pilot zlyhal. Stav je bezpečne zaznamenaný; skontroluj históriu behov.",
        runId: result.runId, errorCode: result.errorCode ?? null,
      }, { status: 502, headers: NO_STORE });
    }
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GeminiPilotGuardError) {
      const messages = {
        PILOT_INVALID_SCOPE: "Pilot je povolený iba pre Tréneri / psie školy.",
        PILOT_SETTING_NOT_SAVED: "Najprv ulož nastavenia tejto karty.",
        PILOT_LIMIT_ZERO: "Maximálny počet konceptov je 0. Zmeň a ulož nastavenie.",
        PILOT_ALREADY_RUNNING: "Pilot už prebieha. Ďalšie spustenie je zablokované.",
      };
      return Response.json({ error: messages[error.code], code: error.code }, {
        status: error.code === "PILOT_INVALID_SCOPE" ? 400 : 409, headers: NO_STORE,
      });
    }
    return Response.json({ error: "Pilot nie je dostupný. Over databázové nastavenia." }, {
      status: 503, headers: NO_STORE,
    });
  }
}
