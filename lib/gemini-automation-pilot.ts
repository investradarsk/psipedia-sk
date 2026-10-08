import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { resolveGeminiConfig, type GeminiFetch } from "./gemini-automation-client.ts";
import { discoverGeminiCandidates } from "./gemini-automation-discovery.ts";
import { checkGeminiCandidateDedupe, geminiDedupeCountsAsDuplicate } from "./gemini-automation-dedupe.ts";
import { bridgeGeminiCandidateToNotion } from "./gemini-automation-notion-bridge.ts";
import {
  beginGeminiManualPilotRun, finishGeminiRun, markGeminiSettingLastRun,
} from "./gemini-automation-store.ts";
import { GeminiAutomationError, type GeminiFailureCode, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";
import type { NotionDirectorySyncBindings } from "./notion-directory-sync.ts";

export const GEMINI_PILOT_STABLE_KEY = "directory.treneri";
export const GEMINI_PILOT_HARD_MAX = 5;
const RUNNING_WINDOW_MS = 15 * 60 * 1000;

export type GeminiPilotSummary = {
  runId: number;
  status: "SUCCESS" | "FAILED";
  model: string;
  candidateCount: number;
  duplicateCount: number;
  possibleDuplicateCount: number;
  rejectedBeforeCount: number;
  conceptCount: number;
  groundedSearchQueryCount: number;
  concepts: Array<{ conceptId: number; canonicalEntityId: number; notionPageId: string | null }>;
  errorCode?: GeminiFailureCode;
};

export type GeminiPilotGuardCode =
  "PILOT_INVALID_SCOPE" | "PILOT_SETTING_NOT_SAVED" |
  "PILOT_LIMIT_ZERO" | "PILOT_ALREADY_RUNNING";

export class GeminiPilotGuardError extends Error {
  readonly code: GeminiPilotGuardCode;
  constructor(code: GeminiPilotGuardCode) {
    super(code);
    this.name = "GeminiPilotGuardError";
    this.code = code;
  }
}

/** Body is only an allowlisted stable key. Never accept prompts, models or budgets. */
export function parseGeminiPilotBody(value: unknown): { stableKey: typeof GEMINI_PILOT_STABLE_KEY } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 1 || !Object.hasOwn(object, "stable_key") ||
    object.stable_key !== GEMINI_PILOT_STABLE_KEY) {
    throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
  }
  return { stableKey: GEMINI_PILOT_STABLE_KEY };
}

type PilotDependencies = {
  discovery?: typeof discoverGeminiCandidates;
  dedupe?: typeof checkGeminiCandidateDedupe;
  bridge?: typeof bridgeGeminiCandidateToNotion;
};

/**
 * Explicit admin mutation only. Production caller never supplies dependencies;
 * injectable boundaries exist solely to test against fake provider/Notion.
 * This module intentionally never registers a scheduler or public route.
 */
export async function runGeminiDirectoryPilot(input: {
  database: D1Database;
  env: GeminiRuntimeConfig & NotionDirectorySyncBindings;
  stableKey: typeof GEMINI_PILOT_STABLE_KEY;
  now?: () => Date;
  fetchImpl?: GeminiFetch;
  dependencies?: PilotDependencies;
}): Promise<GeminiPilotSummary> {
  const catalog = getGeminiCatalogItem(GEMINI_PILOT_STABLE_KEY);
  if (input.stableKey !== GEMINI_PILOT_STABLE_KEY ||
    catalog?.section !== "directory" || catalog.subcategory !== "treneri") {
    throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
  }
  const saved = await input.database.prepare(
    "SELECT id, max_new_concepts FROM gemini_automation_settings WHERE stable_key = ? LIMIT 1",
  ).bind(GEMINI_PILOT_STABLE_KEY).first<{ id: number; max_new_concepts: number }>();
  if (!saved) throw new GeminiPilotGuardError("PILOT_SETTING_NOT_SAVED");
  const effectiveMax = Math.min(saved.max_new_concepts, GEMINI_PILOT_HARD_MAX);
  if (!Number.isSafeInteger(effectiveMax) || effectiveMax <= 0) {
    throw new GeminiPilotGuardError("PILOT_LIMIT_ZERO");
  }
  const now = input.now ?? (() => new Date());
  const started = now().toISOString();
  const model = input.env.GEMINI_MODEL?.trim() || "unconfigured";
  const runId = await beginGeminiManualPilotRun(input.database, {
    settingId: saved.id, stableKey: GEMINI_PILOT_STABLE_KEY,
    model, at: started,
    staleBefore: new Date(new Date(started).getTime() - RUNNING_WINDOW_MS).toISOString(),
  });
  if (!runId) throw new GeminiPilotGuardError("PILOT_ALREADY_RUNNING");

  const summary: GeminiPilotSummary = {
    runId, status: "SUCCESS", model, candidateCount: 0, duplicateCount: 0,
    possibleDuplicateCount: 0, rejectedBeforeCount: 0, conceptCount: 0,
    groundedSearchQueryCount: 0, concepts: [],
  };
  let requestCount = 0;
  try {
    // Validate server configuration before making any billable provider request.
    resolveGeminiConfig(input.env);
    if (!/^gemini-3(?:[.-]|$)/.test(model)) {
      throw new GeminiAutomationError("CONFIG_MISSING");
    }
    const discover = input.dependencies?.discovery ?? discoverGeminiCandidates;
    const dedupe = input.dependencies?.dedupe ?? checkGeminiCandidateDedupe;
    const bridge = input.dependencies?.bridge ?? bridgeGeminiCandidateToNotion;

    // Exactly ONE invocation. No retry, no fallback, no enrichment request.
    requestCount = 1;
    const discovery = await discover({
      env: input.env, stableKey: GEMINI_PILOT_STABLE_KEY,
      maxCandidates: effectiveMax, fetchImpl: input.fetchImpl,
    });
    summary.candidateCount = discovery.candidates.length;
    summary.groundedSearchQueryCount = discovery.providerMetrics.groundedSearchQueryCount;
    // Follow the real provider's contract rather than accepting injected payload metadata.
    if (summary.candidateCount > effectiveMax) throw new GeminiAutomationError("INVALID_RESPONSE");

    for (const candidate of discovery.candidates) {
      const decision = await dedupe(input.database, {
        stableKey: GEMINI_PILOT_STABLE_KEY, section: "directory",
        subcategory: "treneri", candidate,
      });
      if (geminiDedupeCountsAsDuplicate(decision.status)) summary.duplicateCount++;
      if (decision.status === "POSSIBLE_DUPLICATE") summary.possibleDuplicateCount++;
      if (decision.status === "REJECTED_BEFORE") summary.rejectedBeforeCount++;
      if (decision.status !== "NEW") continue;

      const concept = await bridge({
        database: input.database, notion: input.env,
        stableKey: GEMINI_PILOT_STABLE_KEY, candidate,
      });
      if (concept.created) {
        summary.conceptCount++;
        summary.concepts.push({
          conceptId: concept.conceptId,
          canonicalEntityId: concept.canonicalEntityId,
          notionPageId: concept.notionPageId,
        });
      }
    }
    await finishGeminiRun(input.database, {
      id: runId, status: "SUCCESS", at: now().toISOString(), requestCount,
      groundedSearchQueryCount: summary.groundedSearchQueryCount,
      candidateCount: summary.candidateCount, duplicateCount: summary.duplicateCount,
      conceptCount: summary.conceptCount, errorCount: 0,
    });
  } catch (error) {
    summary.status = "FAILED";
    // Bridge and DB failures are not misrepresented as provider failures.
    if (error instanceof GeminiAutomationError) {
      summary.errorCode = error.code;
      // Preserve already executed provider query counts even when provenance fails.
      // No new D1 columns or raw provider content are stored.
      if (error.code === "INVALID_RESPONSE" &&
        Number.isInteger(error.groundedSearchQueryCount) &&
        error.groundedSearchQueryCount! >= 0 && error.groundedSearchQueryCount! <= 100) {
        summary.groundedSearchQueryCount = error.groundedSearchQueryCount!;
      }
    }
    await finishGeminiRun(input.database, {
      id: runId, status: "FAILED", at: now().toISOString(), requestCount,
      groundedSearchQueryCount: summary.groundedSearchQueryCount,
      candidateCount: summary.candidateCount, duplicateCount: summary.duplicateCount,
      conceptCount: summary.conceptCount, errorCount: 1, errorCode: summary.errorCode,
    });
  }
  // Manual completion never rewrites next_run_at or enables the future scheduler.
  await markGeminiSettingLastRun(input.database, saved.id, now().toISOString());
  return summary;
}
