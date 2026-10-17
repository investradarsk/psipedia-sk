import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import {
  GeminiPilotGuardError, parseGeminiDirectoryRunBody, runGeminiDirectoryCategory,
} from "@/lib/gemini-automation-pilot";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { dispatchPendingExternalGemini, enqueueExternalGemini, externalAgentEnabled, ExternalAgentError } from "@/lib/gemini-external-agent";
import {enqueueGeminiManualBackgroundJob,geminiManualBackgroundEnabled,GeminiQueueGuardError} from "@/lib/gemini-automation-background-queue";
import { parseGeminiEventRunBody, runGeminiEventCategory } from "@/lib/gemini-automation-event-runner";
import type { NotionEventsHelpSyncBindings } from "@/lib/notion-events-help-sync";
import type { GeminiRuntimeConfig } from "@/lib/gemini-automation-types";
import type { NotionDirectorySyncBindings } from "@/lib/notion-directory-sync";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

/** Admin-only, one category per explicit manual request. No scheduler hookup. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  try {
    const body: unknown = await request.json().catch(() => null);
    const key = body && typeof body === "object" && !Array.isArray(body)
      ? (body as {stable_key?:unknown}).stable_key : null;
    const catalog = typeof key === "string" ? getGeminiCatalogItem(key) : null;
    if (!catalog) throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
    const database = requireGeminiAdminD1() as D1Database;
    if (externalAgentEnabled(env)) {
      const queued = await enqueueExternalGemini({
        db: database, env, stableKey: key as string,
      });
      // Immediately start the oldest approved job if the worker is idle.
      // Otherwise it stays in the D1 queue for the next five-minute Cron.
      const started = await dispatchPendingExternalGemini({ db: database, env });
      return Response.json({
        ...queued, started: started.dispatched === 1 && started.jobId === queued.jobId,
      }, { status: 202, headers: NO_STORE });
    }
    if (geminiManualBackgroundEnabled(env as unknown as {GEMINI_ASYNC_MANUAL_ENABLED?:string})) {
      const queued=await enqueueGeminiManualBackgroundJob({
        database,
        env: env as unknown as GeminiRuntimeConfig & NotionEventsHelpSyncBindings & NotionDirectorySyncBindings,
        stableKey: key as string,
      });
      return Response.json(queued,{status:202,headers:NO_STORE});
    }
    const result = catalog.section === "events"
      ? await runGeminiEventCategory({
          database, env: env as unknown as GeminiRuntimeConfig & NotionEventsHelpSyncBindings,
          stableKey: parseGeminiEventRunBody(body).stableKey,
        })
      : await runGeminiDirectoryCategory({
          database, env: env as unknown as GeminiRuntimeConfig & NotionDirectorySyncBindings,
          stableKey: parseGeminiDirectoryRunBody(body).stableKey,
        });
    if (result.status === "FAILED") {
      return Response.json({
        error: "Gemini beh zlyhal. Stav je zaznamenaný; skontroluj históriu behov.",
        runId: result.runId, errorCode: result.errorCode ?? null,
      }, { status: 502, headers: NO_STORE });
    }
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ExternalAgentError) {
      const messages = {
        DISABLED: "Externý Gemini pracovník nie je zapnutý.",
        CONFIG: "Chýba bezpečná konfigurácia GitHub Actions alebo callbacku.",
        CATEGORY: "Neznáma podkategória.",
        SETTING: "Najprv ulož nastavenia podkategórie.",
        LIMIT: "Maximálny počet konceptov musí byť väčší než nula.",
        BUSY: "Poradovník Gemini je naplnený alebo sa práve mení. Skús požiadavku zopakovať po aktualizácii stránky.",
        DISPATCH: "Spustenie na GitHube nie je potvrdené. Pred opakovaním over úlohu v histórii.",
      };
      return Response.json({ error: messages[error.code], code: "EXTERNAL_" + error.code }, {
        status: error.code === "CATEGORY" ? 400 : 409, headers: NO_STORE,
      });
    }
    if (error instanceof GeminiPilotGuardError || error instanceof GeminiQueueGuardError) {
      const messages = {
        PILOT_INVALID_SCOPE: "Manuálne spustenie je povolené len pre existujúce kategórie Adresára a Podujatí.",
        PILOT_SETTING_NOT_SAVED: "Najprv ulož nastavenia tejto kategórie.",
        PILOT_LIMIT_ZERO: "Maximálny počet konceptov je 0. Zmeň a ulož nastavenie.",
        PILOT_ALREADY_RUNNING: "Ďalšie Gemini vyhľadávanie už čaká alebo beží. Po dokončení môžeš spustiť nové.",
      };
      return Response.json({ error: messages[error.code], code: error.code }, {
        status: error.code === "PILOT_INVALID_SCOPE" ? 400 : 409, headers: NO_STORE,
      });
    }
    return Response.json({ error: "Gemini nie je dostupné. Over databázové nastavenia." }, {
      status: 503, headers: NO_STORE,
    });
  }
}
