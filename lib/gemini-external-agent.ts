import { externalWorkerCategorySupported } from "../scripts/gemini-notion-category.mjs";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";

export type GeminiExternalEnv = {
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
    "LIMIT" | "BUDGET" | "BUSY" | "DISPATCH";
  constructor(code: ExternalAgentError["code"]) {
    super(code);
    this.code = code;
  }
}
type Setting = { id: number; max_new_concepts: number; cadence_minutes: number };
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
    "SELECT id,max_new_concepts,cadence_minutes FROM gemini_automation_settings WHERE stable_key=?"
  ).bind(stableKey).first<Setting>();
  if (!setting) throw new ExternalAgentError("SETTING");
  if (setting.max_new_concepts <= 0) throw new ExternalAgentError("LIMIT");
  // Fail-closed monthly request fuse, including legacy manual queue entries.
  // Conservative 10 dispatches/month; actual spend must ALSO be limited at Google.
  const beginning = new Date(input.now ?? new Date());
  beginning.setUTCDate(1);
  beginning.setUTCHours(0, 0, 0, 0);
  const usage = await db.prepare(
    "SELECT COUNT(*) AS total FROM gemini_manual_background_jobs WHERE created_at >= ?"
  ).bind(beginning.toISOString()).first<{ total: number }>();
  if ((usage?.total ?? 0) >= 10) throw new ExternalAgentError("BUDGET");

  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
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
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    status = response.status;
    if (status !== 200 && status !== 204) throw new Error("Dispatch was rejected");
    if (trigger === "SCHEDULED") {
      const next = new Date(now.getTime() + setting.cadence_minutes * 60000).toISOString();
      await db.prepare(
        "UPDATE gemini_automation_settings SET next_run_at=?,updated_at=? WHERE id=?"
      ).bind(next, startedAt, setting.id).run();
    }
    return { jobId, status: "QUEUED" };
  } catch {
    // Ambiguous response might have dispatched. Never auto-retry the same paid job.
    const rejected = status !== null && [400, 401, 403, 404, 422].includes(status);
    await db.prepare(
      "UPDATE gemini_manual_background_jobs SET status=?,error_code=?,completed_at=? WHERE id=? AND status='RUNNING'"
    ).bind(rejected ? "FAILED" : "RUNNING",
      rejected ? "EXT_DISPATCH_REJECTED" : "EXT_DISPATCH_UNCERTAIN",
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
  const due = await input.db.prepare(
    "SELECT stable_key FROM gemini_automation_settings WHERE enabled=1 " +
    "AND max_new_concepts>0 AND next_run_at IS NOT NULL AND next_run_at<=? " +
    "ORDER BY next_run_at ASC,id ASC LIMIT 1"
  ).bind(now.toISOString()).first<{ stable_key: string }>();
  if (!due) return { dispatched: 0 };
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
  if (!job || job.status !== "RUNNING" || !job.error_code.startsWith("EXT_"))
    return { status: 409, ok: false };
  const now = new Date().toISOString();
  const updated = await input.db.prepare(
    "UPDATE gemini_manual_background_jobs SET status=?,error_code=?,completed_at=? " +
    "WHERE id=? AND status='RUNNING' AND error_code LIKE 'EXT_%'"
  ).bind(status, code ?? null, now, jobId).run();
  if (updated.meta.changes !== 1) return { status: 409, ok: false };
  const trigger = job.error_code === "EXT_SCHEDULED" ? "SCHEDULED" : "MANUAL";
  const run = await input.db.prepare(
    "INSERT INTO gemini_automation_runs(setting_id,trigger_type,status,started_at,completed_at," +
    "model,request_count,grounded_search_query_count,candidate_count,duplicate_count,concept_count," +
    "error_count,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(job.setting_id, trigger, status,
    now, now, "gemini-3.8-flash", requests, searches, Number(count) + Number(duplicates),
    duplicates, count, status === "SUCCESS" ? 0 : 1,
    status === "SUCCESS" ? null : "PROVIDER_ERROR").run();
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
