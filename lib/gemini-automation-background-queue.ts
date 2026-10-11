import {getGeminiCatalogItem} from "./gemini-automation-catalog.ts";
import {resolveGeminiConfig} from "./gemini-automation-client.ts";
import type {runGeminiDirectoryCategory} from "./gemini-automation-pilot.ts";
import type {runGeminiEventCategory} from "./gemini-automation-event-runner.ts";
import type {GeminiRuntimeConfig} from "./gemini-automation-types.ts";
import type {NotionEventsHelpSyncBindings} from "./notion-events-help-sync.ts";
import type {NotionDirectorySyncBindings} from "./notion-directory-sync.ts";

/**
 * Manual-only queue. Cloudflare scheduled invocations process jobs already
 * accepted from authenticated admin POSTs; NEVER schedule new paid searches.
 * A job with uncertain outcome stays RUNNING until an operator investigates.
 */
export class GeminiQueueGuardError extends Error {
  readonly code:"PILOT_INVALID_SCOPE"|"PILOT_SETTING_NOT_SAVED"|"PILOT_LIMIT_ZERO"|"PILOT_ALREADY_RUNNING";
  constructor(code:GeminiQueueGuardError["code"]) {super(code);this.code=code;}
}
export const GEMINI_BACKGROUND_TIMEOUT_MS=300_000;
export type GeminiQueueStatus="QUEUED"|"RUNNING"|"SUCCESS"|"FAILED";
export type GeminiQueuedJob={
  id:number;stable_key:string;status:GeminiQueueStatus;run_id:number|null;
  error_code:string|null;created_at:string;claimed_at:string|null;completed_at:string|null;
};
type QueueEnv=GeminiRuntimeConfig & NotionDirectorySyncBindings & NotionEventsHelpSyncBindings;
export function geminiManualBackgroundEnabled(env:{GEMINI_ASYNC_MANUAL_ENABLED?:string}) {
  return ["true","1"].includes((env.GEMINI_ASYNC_MANUAL_ENABLED??"").trim().toLowerCase());
}
export async function listGeminiManualBackgroundJobs(db:D1Database,limit=30):Promise<GeminiQueuedJob[]> {
  const bounded=Number.isSafeInteger(limit)?Math.max(1,Math.min(50,limit)):30;
  const query=await db.prepare(
    "SELECT id,stable_key,status,run_id,error_code,created_at,claimed_at,completed_at "+
    "FROM gemini_manual_background_jobs ORDER BY id DESC LIMIT ?"
  ).bind(bounded).all<GeminiQueuedJob>();
  return query.results??[];
}

/** Called only after admin authorization; never exposes an arbitrary provider prompt. */
export async function enqueueGeminiManualBackgroundJob(input:{
  database:D1Database;env:QueueEnv;stableKey:string;
}):Promise<{jobId:number;status:"QUEUED"}> {
  const {database:db,stableKey}=input;
  const category=getGeminiCatalogItem(stableKey);
  // Help has no safe Gemini discovery/bridge yet. Fail closed rather than silently misroute.
  if(!category || !["directory","events"].includes(category.section))
    throw new GeminiQueueGuardError("PILOT_INVALID_SCOPE");
  resolveGeminiConfig(input.env);
  const setting=await db.prepare(
    "SELECT id,max_new_concepts FROM gemini_automation_settings WHERE stable_key=? LIMIT 1"
  ).bind(stableKey).first<{id:number;max_new_concepts:number}>();
  if(!setting)throw new GeminiQueueGuardError("PILOT_SETTING_NOT_SAVED");
  if(setting.max_new_concepts<=0)throw new GeminiQueueGuardError("PILOT_LIMIT_ZERO");
  // Exactly one active or pending background job globally. Fail closed on collisions.
  const result=await db.prepare(
    "INSERT INTO gemini_manual_background_jobs(setting_id,stable_key,status) "+
    "SELECT ?,?,'QUEUED' WHERE NOT EXISTS ("+
    "SELECT 1 FROM gemini_manual_background_jobs WHERE status IN ('QUEUED','RUNNING'))"
  ).bind(setting.id,stableKey).run();
  if((result.meta.changes??0)!==1)throw new GeminiQueueGuardError("PILOT_ALREADY_RUNNING");
  const jobId=Number(result.meta.last_row_id);
  if(!Number.isSafeInteger(jobId)||jobId<=0)throw new Error("GEMINI_QUEUE_ID_INVALID");
  return {jobId,status:"QUEUED"};
}

export type GeminiQueueSweepSummary={
  claimed:number;processed:number;succeeded:number;failed:number;blocked:number;
};

function requireEventExecutor(fn:typeof runGeminiEventCategory|undefined) {
  if(!fn)throw Error("GEMINI_EVENT_QUEUE_EXECUTOR_MISSING");
  return fn;
}
function requireDirectoryExecutor(fn:typeof runGeminiDirectoryCategory|undefined) {
  if(!fn)throw Error("GEMINI_DIRECTORY_QUEUE_EXECUTOR_MISSING");
  return fn;
}
/** At most one provider request per Cron invocation, with NO retry after uncertain errors. */
export async function runGeminiManualBackgroundSweep(input:{
  database:D1Database;env:QueueEnv;
  executeDirectory?:typeof runGeminiDirectoryCategory;
  executeEvent?:typeof runGeminiEventCategory;
}):Promise<GeminiQueueSweepSummary> {
  const summary:GeminiQueueSweepSummary={claimed:0,processed:0,succeeded:0,failed:0,blocked:0};
  const db=input.database;
  const existing=await db.prepare(
    "SELECT id FROM gemini_manual_background_jobs WHERE status='RUNNING' LIMIT 1"
  ).first<{id:number}>();
  if(existing) {summary.blocked=1;return summary;}
  const job=await db.prepare(
    "SELECT id,stable_key FROM gemini_manual_background_jobs "+
    "WHERE status='QUEUED' ORDER BY id ASC LIMIT 1"
  ).first<{id:number;stable_key:string}>();
  if(!job)return summary;
  const claimed=await db.prepare(
    "UPDATE gemini_manual_background_jobs SET status='RUNNING',claimed_at=? "+
    "WHERE id=? AND status='QUEUED'"
  ).bind(new Date().toISOString(),job.id).run();
  if((claimed.meta.changes??0)!==1)return summary;
  summary.claimed=1;
  const category=getGeminiCatalogItem(job.stable_key);
  try {
    if(!category||!["directory","events"].includes(category.section))throw new Error("GEMINI_QUEUE_UNSUPPORTED_CATEGORY");
    const run=category.section==="events"
      ? await requireEventExecutor(input.executeEvent)({
          database:db,env:input.env,stableKey:job.stable_key,timeoutMs:GEMINI_BACKGROUND_TIMEOUT_MS,
        })
      : await requireDirectoryExecutor(input.executeDirectory)({
          database:db,env:input.env,stableKey:job.stable_key,timeoutMs:GEMINI_BACKGROUND_TIMEOUT_MS,
        });
    summary.processed=1;
    if(run.status==="SUCCESS")summary.succeeded=1;
    else summary.failed=1;
    await db.prepare(
      "UPDATE gemini_manual_background_jobs SET status=?,run_id=?,error_code=?,completed_at=? "+
      "WHERE id=? AND status='RUNNING'"
    ).bind(run.status,run.runId,run.errorCode??null,new Date().toISOString(),job.id).run();
  } catch {
    // NEVER repeat a possibly billed provider call after an uncertain exception.
    summary.failed=1;
    await db.prepare(
      "UPDATE gemini_manual_background_jobs SET status='FAILED',error_code='PROCESSING_ERROR',completed_at=? "+
      "WHERE id=? AND status='RUNNING'"
    ).bind(new Date().toISOString(),job.id).run();
  }
  return summary;
}
