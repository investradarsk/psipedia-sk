import { externalWorkerCategorySupported } from "../scripts/gemini-notion-category.mjs";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { getGeminiCategoryPrompt } from "./gemini-automation-category-prompt-store.ts";
import { nextGeminiRunAt } from "./gemini-automation-schedule.ts";
import { parseGeminiCreatedPages, verifyGeminiCreatedPages, registerGeminiCreatedPages, type GeminiProvenanceEnv } from "./gemini-notion-provenance.ts";

export type GeminiExternalEnv = GeminiProvenanceEnv & {
  GEMINI_EXTERNAL_AGENT_ENABLED?: string;
  GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED?: string;
  GITHUB_ACTIONS_DISPATCH_TOKEN?: string;
  GEMINI_AGENT_CALLBACK_SECRET?: string;
};
export const externalAgentEnabled = (env: GeminiExternalEnv) =>
  ["1", "true"].includes((env.GEMINI_EXTERNAL_AGENT_ENABLED ?? "").trim().toLowerCase());

// Opt-in independently of the manual external worker. No scheduled paid jobs
// can dispatch simply because the first manual test was enabled.
export const externalAgentScheduledEnabled = (env: GeminiExternalEnv) =>
  externalAgentEnabled(env) &&
  ["1", "true"].includes((env.GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED ?? "").trim().toLowerCase());

export class ExternalAgentError extends Error {
  readonly code: "DISABLED" | "CONFIG" | "CATEGORY" | "SETTING" |
    "LIMIT" | "BUSY" | "DISPATCH";
  constructor(code: ExternalAgentError["code"]) {
    super(code);
    this.code = code;
  }
}
type Setting = { id: number; max_new_concepts: number; cadence_minutes: number; weekly_day: number | null; enabled: number; next_run_at: string | null };
const DISPATCH_URL = "https://api.github.com/repos/investradarsk/psipedia-sk/actions/workflows/gemini-notion-agent.yml/dispatches";

export async function dispatchExternalGemini(input: {
  db: D1Database; env: GeminiExternalEnv; stableKey: string;
  trigger: "MANUAL" | "SCHEDULED"; now?: Date;
}): Promise<{ jobId: number; status: "QUEUED" }> {
  const { db, env, stableKey, trigger } = input;
  if (!externalAgentEnabled(env) ||
      (trigger === "SCHEDULED" && !externalAgentScheduledEnabled(env)))
    throw new ExternalAgentError("DISABLED");
  if (!env.GITHUB_ACTIONS_DISPATCH_TOKEN || !env.GEMINI_AGENT_CALLBACK_SECRET)
    throw new ExternalAgentError("CONFIG");
  if (!getGeminiCatalogItem(stableKey) || !externalWorkerCategorySupported(stableKey)) throw new ExternalAgentError("CATEGORY");
  const setting = await db.prepare(
    "SELECT id,max_new_concepts,cadence_minutes,weekly_day,enabled,next_run_at FROM gemini_automation_settings WHERE stable_key=?"
  ).bind(stableKey).first<Setting>();
  if (!setting) throw new ExternalAgentError("SETTING");
  if (setting.max_new_concepts <= 0) throw new ExternalAgentError("LIMIT");
  // Resolve the effective admin-edited category prompt BEFORE reserving a paid job.
  // Missing migration/configuration fails closed; read never seeds D1.
  let categoryPrompt: string;
  try {
    const view = await getGeminiCategoryPrompt(db, stableKey);
    if (!view?.effectivePrompt || view.effectivePrompt.length > 6000) throw Error("PROMPT_INVALID");
    categoryPrompt = view.effectivePrompt;
  } catch { throw new ExternalAgentError("CONFIG"); }
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  if (trigger === "SCHEDULED" && (!setting.enabled || !setting.next_run_at || setting.next_run_at > startedAt))
    throw new ExternalAgentError("SETTING");
  const dueAt = trigger === "SCHEDULED" ? setting.next_run_at : null;
  const marker = trigger === "SCHEDULED" ? "EXT_SCHEDULED" : "EXT_MANUAL";
  // Insert directly as RUNNING. The old manual Cron runner only claims QUEUED jobs.
  // Existing unique active-job index also serializes the external worker globally.
  let inserted;
  try {
    inserted = await db.prepare(
      "INSERT INTO gemini_manual_background_jobs(setting_id,stable_key,status,error_code,created_at,claimed_at) " +
      "VALUES (?,?,'RUNNING',?,?,?)"
    ).bind(setting.id, stableKey, marker, startedAt, startedAt).run();
  } catch {
    throw new ExternalAgentError("BUSY");
  }
  const jobId = Number(inserted.meta.last_row_id);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new ExternalAgentError("BUSY");
  // Reserve the exact due occurrence before making an uncertain paid network call.
  // The existing global unique RUNNING/QUEUED index serializes all categories.
  if (dueAt) {
    const next = nextGeminiRunAt(new Date(dueAt), setting.cadence_minutes, setting.weekly_day, now);
    const reserved = await db.prepare(
      "UPDATE gemini_automation_settings SET next_run_at=?,updated_at=? " +
      "WHERE id=? AND enabled=1 AND next_run_at=? AND max_new_concepts>0"
    ).bind(next, startedAt, setting.id, dueAt).run();
    if ((reserved.meta.changes ?? 0) !== 1) {
      await db.prepare(
        "UPDATE gemini_manual_background_jobs SET status='FAILED',error_code='EXT_SETTING_CHANGED',completed_at=? WHERE id=? AND status='RUNNING'"
      ).bind(startedAt, jobId).run();
      throw new ExternalAgentError("SETTING");
    }
  }
  let status: number | null = null;
  try {
    const response = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GITHUB_ACTIONS_DISPATCH_TOKEN,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "psipedia-gemini-agent",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          job_id: String(jobId), stable_key: stableKey,
          max_new_concepts: String(Math.min(5, setting.max_new_concepts)),
          trigger_type: trigger,
          category_prompt: categoryPrompt,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    status = response.status;
    if (status !== 200 && status !== 204) throw new Error("Dispatch was rejected");
    return { jobId, status: "QUEUED" };
  } catch {
    // Ambiguous response might have dispatched. Never auto-retry the same paid job.
    const rejected = status !== null && [400, 401, 403, 404, 422].includes(status);
    await db.prepare(
      "UPDATE gemini_manual_background_jobs SET status=?,error_code=?,completed_at=? WHERE id=? AND status='RUNNING'"
    ).bind(rejected ? "FAILED" : "RUNNING",
      rejected ? "EXT_DISPATCH_REJECTED" : (trigger === "SCHEDULED" ? "EXT_SCHEDULED_UNCERTAIN" : "EXT_MANUAL_UNCERTAIN"),
      rejected ? startedAt : null, jobId).run();
    throw new ExternalAgentError("DISPATCH");
  }
}

export async function sweepExternalGemini(input: {
  db: D1Database; env: GeminiExternalEnv; now?: Date;
}): Promise<{ dispatched: number; reason?: string }> {
  if (!externalAgentEnabled(input.env)) return { dispatched: 0, reason: "DISABLED" };
  if (!externalAgentScheduledEnabled(input.env))
    return { dispatched: 0, reason: "SCHEDULE_DISABLED" };
  const now = input.now ?? new Date();
  const active = await input.db.prepare(
    "SELECT claimed_at FROM gemini_manual_background_jobs WHERE status='RUNNING' ORDER BY id ASC LIMIT 1"
  ).first<{ claimed_at: string | null }>();
  if (active) {
    const stale = active.claimed_at && now.getTime() - new Date(active.claimed_at).getTime() > 2 * 60 * 60_000;
    return { dispatched: 0, reason: stale ? "STALLED_REVIEW" : "BUSY" };
  }
  // An as-yet unsupported category must not starve the other due categories.
  // Keep its original due slot for when the worker's category contract lands.
  const dueRows = await input.db.prepare(
    "SELECT stable_key FROM gemini_automation_settings WHERE enabled=1 " +
    "AND max_new_concepts>0 AND next_run_at IS NOT NULL AND next_run_at<=? " +
    "ORDER BY next_run_at ASC,id ASC LIMIT 22"
  ).bind(now.toISOString()).all<{ stable_key: string }>();
  const due = (dueRows.results ?? []).find((row) => externalWorkerCategorySupported(row.stable_key));
  if (!due) return { dispatched: 0, ...(dueRows.results?.length ? { reason: "CATEGORY_NOT_READY" } : {}) };
  try {
    await dispatchExternalGemini({
      db: input.db, env: input.env, stableKey: due.stable_key, trigger: "SCHEDULED", now,
    });
    return { dispatched: 1 };
  } catch (error) {
    return { dispatched: 0, reason: error instanceof ExternalAgentError ? error.code : "ERROR" };
  }
}

export async function completeExternalGemini(input: {
  db: D1Database; env: GeminiExternalEnv; body: string; signature: string | null;
}): Promise<{ status: number; ok: boolean }> {
  const secret = input.env.GEMINI_AGENT_CALLBACK_SECRET;
  if (!externalAgentEnabled(input.env) || !secret) return { status: 503, ok: false };
  const signature = input.signature ?? "";
  if (input.body.length > 4096 || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return { status: 401, ok: false };
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const digest = Uint8Array.from(signature.slice(7).match(/.{2}/g) ?? [], (hex) => parseInt(hex, 16));
  if (!await crypto.subtle.verify("HMAC", key, digest, new TextEncoder().encode(input.body)))
    return { status: 401, ok: false };
  let result: Record<string, unknown>;
  try { result = JSON.parse(input.body) as Record<string, unknown>; }
  catch { return { status: 400, ok: false }; }
  const jobId = result.job_id;
  const status = result.status;
  const count = result.concept_count;
  const duplicates = result.duplicate_count;
  const requests = result.request_count;
  const searches = result.search_count;
  const code = result.error_code;
  const outcome = result.outcome_code;
  const outcomes = ["no_relevant_candidate", "duplicate_only", "insufficient_evidence", "exhausted"];
  if (outcome !== undefined && outcome !== null &&
      (status !== "SUCCESS" || count !== 0 || !outcomes.includes(outcome as string)))
    return { status: 400, ok: false };
  if (!Number.isSafeInteger(jobId) || Number(jobId) < 1 ||
    (status !== "SUCCESS" && status !== "FAILED") ||
    !Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > 5 ||
    !Number.isSafeInteger(duplicates) || Number(duplicates) < 0 || Number(duplicates) > 1000 ||
    !Number.isSafeInteger(requests) || Number(requests) < 0 || Number(requests) > 12 ||
    !Number.isSafeInteger(searches) || Number(searches) < 0 || Number(searches) > 100 ||
    (code != null && (typeof code !== "string" || !/^[A-Z0-9_]{1,45}$/.test(code))))
    return { status: 400, ok: false };
  const job = await input.db.prepare(
    "SELECT id,setting_id,error_code,stable_key,status FROM gemini_manual_background_jobs WHERE id=?"
  ).bind(jobId).first<{ id: number; setting_id: number; error_code: string; stable_key: string; status: string }>();
  if (!job) return { status: 409, ok: false };
  // At-least-once callback transport: accept identical completed receipts,
  // never replay state changes or accept a different list of Notion identities.
  if (job.status === status && result.created_pages !== undefined) {
    const parsed = parseGeminiCreatedPages(result.created_pages, job.stable_key, Number(count), input.env);
    if (!parsed) return { status: 400, ok: false };
    const priorRun = await input.db.prepare(
      "SELECT concept_count,duplicate_count,request_count,grounded_search_query_count,status " +
      "FROM gemini_automation_runs WHERE id=(SELECT run_id FROM gemini_manual_background_jobs WHERE id=?)"
    ).bind(jobId).first<{ concept_count: number; duplicate_count: number;
      request_count: number; grounded_search_query_count: number; status: string }>();
    if (!priorRun || priorRun.status !== status || priorRun.concept_count !== count ||
        priorRun.duplicate_count !== duplicates || priorRun.request_count !== requests ||
        priorRun.grounded_search_query_count !== searches) return { status: 409, ok: false };
    const saved = await input.db.prepare(
      "SELECT notion_page_id,stable_key,import_agenda FROM gemini_notion_created_pages WHERE job_id=?"
    ).bind(jobId).all<{ notion_page_id: string; stable_key: string; import_agenda: string }>();
    const expected = parsed.pages.map(page => page.notion_page_id.toLowerCase()).sort();
    const actual = (saved.results ?? []).map(page => page.notion_page_id.toLowerCase()).sort();
    if (actual.length !== expected.length ||
        actual.some((id, index) => id !== expected[index]) ||
        (saved.results ?? []).some(page =>
          page.stable_key !== job.stable_key || page.import_agenda !== parsed.agenda))
      return { status: 409, ok: false };
    return { status: 200, ok: true };
  }
  if (job.status !== "RUNNING" || !job.error_code.startsWith("EXT_"))
    return { status: 409, ok: false };
  // Signed worker receipts only; old workers without created_pages stay compatible,
  // but their pages do NOT receive the trusted origin required for auto-import.
  if (result.created_pages !== undefined) {
    const parsed = parseGeminiCreatedPages(result.created_pages, job.stable_key, Number(count), input.env);
    if (!parsed) return { status: 400, ok: false };
    try {
      await verifyGeminiCreatedPages(input.env, parsed.pages);
      await registerGeminiCreatedPages(input.db, Number(jobId), parsed);
    } catch {
      // Never complete the job on an uncertain or foreign page receipt.
      return { status: 503, ok: false };
    }
  }
  const now = new Date().toISOString();
  const trigger = job.error_code.startsWith("EXT_SCHEDULED") ? "SCHEDULED" : "MANUAL";
  const updated = await input.db.prepare(
    "UPDATE gemini_manual_background_jobs SET status=?,error_code=?,completed_at=? " +
    "WHERE id=? AND status='RUNNING' AND error_code LIKE 'EXT_%'"
  ).bind(status, code ?? null, now, jobId).run();
  if (updated.meta.changes !== 1) return { status: 409, ok: false };
  const run = await input.db.prepare(
    "INSERT INTO gemini_automation_runs(setting_id,trigger_type,status,started_at,completed_at," +
    "model,request_count,grounded_search_query_count,candidate_count,duplicate_count,concept_count," +
    "error_count,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(job.setting_id, trigger, status,
    now, now, "gemini-3.8-flash", requests, searches, Number(count) + Number(duplicates),
    duplicates, count, status === "SUCCESS" ? 0 : 1,
    status === "SUCCESS" ? (count === 0 && typeof outcome === "string" ? "NO_RESULT_" + outcome.toUpperCase() : null) : (
      ["RATE_LIMITED", "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "INSUFFICIENT_CREDIT"].includes(String(code))
        ? "RATE_LIMITED" : "PROVIDER_ERROR")).run();
  const runId = Number(run.meta.last_row_id);
  await input.db.prepare(
    "UPDATE gemini_manual_background_jobs SET run_id=? WHERE id=?"
  ).bind(runId, jobId).run();
  await input.db.prepare(
    "UPDATE gemini_automation_settings SET last_run_at=? WHERE id=?"
  ).bind(now, job.setting_id).run();
  // Native Psipedia admin notice: this is metadata only, no candidate processing.
  try {
    const { enqueueAutomationActionAdminNotification } = await import("./admin-notifications.ts");
    const label = getGeminiCatalogItem(job.stable_key)?.label ?? job.stable_key;
    await enqueueAutomationActionAdminNotification(input.db, {
      eventType: status === "SUCCESS" ? "automation_run_success" : "automation_run_failed",
      resourceType: "gemini_external",
      resourceRef: jobId,
      targetUrl: "/admin/automatizacie-gemini",
      title: status === "SUCCESS"
        ? "Gemini — " + label : "Gemini — úloha zlyhala",
      body: status === "SUCCESS"
        ? "Gemini vytvorilo " + count + " nových konceptov. Skontroluj ich v Notione."
        : "Externá úloha zlyhala. Skontroluj históriu behov.",
      tag: "gemini-external-" + jobId,
      dedupeKey: "gemini-external/" + jobId + "/" + status,
    });
  } catch {
    // Failure to enqueue a notification cannot repeat external paid research.
  }
  return { status: 200, ok: true };
}
