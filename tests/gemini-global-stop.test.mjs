import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { saveGeminiSetting } from "../lib/gemini-automation-admin-store.ts";
import { beginGeminiManualPilotRun } from "../lib/gemini-automation-store.ts";
import { enqueueExternalGemini, dispatchExternalGemini, ExternalAgentError } from "../lib/gemini-external-agent.ts";
import {
  getGeminiGlobalControl, requireGeminiRunning,
  setGeminiGlobalStop, authorizeGeminiExternalWorker, GeminiGlobalControlError,
} from "../lib/gemini-global-control.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const at = new Date("2026-10-20T08:00:00.000Z");
const later = new Date("2026-10-26T12:00:00.000Z");
const key = "directory.veterinari";
const env = {
  GEMINI_EXTERNAL_AGENT_ENABLED: "true",
  GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  GITHUB_ACTIONS_DISPATCH_TOKEN: "offline-only",
  GEMINI_AGENT_CALLBACK_SECRET: "offline-callback",
};
function fixture(withMigration = true) {
  const sqlite = new DatabaseSync(":memory:");
  for (const filename of ["0113_gemini_automation_foundation.sql",
    "0119_gemini_manual_background_jobs.sql", "0125_gemini_category_prompts.sql",
    "0126_gemini_scheduler_admin_v2.sql"]) {
    sqlite.exec(read("drizzle/" + filename));
  }
  if (withMigration) sqlite.exec(read("drizzle/0136_gemini_global_stop.sql"));
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      const bound = {
        bind(...params) { args = params; return bound; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() {
          const result = stmt.run(...args);
          return { meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return bound;
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}
async function seed(db, { enabled = true, cadenceMinutes = 1440, maxNewConcepts = 8 } = {}) {
  return saveGeminiSetting(db, {
    stableKey: key, enabled, cadenceMinutes, weeklyDay: null, maxNewConcepts,
  }, at);
}
async function addJob(db, status = "QUEUED") {
  const row = await db.prepare("SELECT id FROM gemini_automation_settings WHERE stable_key=?")
    .bind(key).first();
  const result = await db.prepare(
    "INSERT INTO gemini_manual_background_jobs(setting_id,stable_key,status,error_code,created_at) VALUES (?,?,?,?,?)"
  ).bind(row.id, key, status, status === "QUEUED" ? "EXT_MANUAL_PENDING" : "EXT_MANUAL",
    at.toISOString()).run();
  return result.meta.last_row_id;
}

test("0136 is additive, default RUNNING, and does not change 22 per-category settings", async () => {
  const { db, sqlite } = fixture();
  const before = sqlite.prepare("SELECT COUNT(*) AS total FROM gemini_automation_settings").get().total;
  assert.equal(before, 0);
  assert.equal((await getGeminiGlobalControl(db)).state, "RUNNING");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM gemini_manual_background_jobs").get().total, 0);
  await seed(db);
  const settings = sqlite.prepare("SELECT enabled,cadence_minutes,max_new_concepts FROM gemini_automation_settings").get();
  assert.deepEqual({ ...settings }, { enabled: 1, cadence_minutes: 1440, max_new_concepts: 8 });
  sqlite.close();
});

test("STOP atomically cancels FIFO approvals without deleting history or changing schedules", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  const original = sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at;
  const id = await addJob(db);
  const stopped = await setGeminiGlobalStop(db, true, at);
  assert.equal(stopped.state, "STOPPED");
  assert.equal(sqlite.prepare("SELECT state FROM gemini_global_control").get().state, "STOPPED");
  assert.deepEqual({ ...sqlite.prepare(
    "SELECT status,error_code,run_id FROM gemini_manual_background_jobs WHERE id=?"
  ).get(id) }, { status: "FAILED", error_code: "GEMINI_GLOBAL_STOP_CANCELLED", run_id: null });
  assert.equal(sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at, original);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM gemini_manual_background_jobs").get().total, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM gemini_automation_runs").get().total, 0);
  sqlite.close();
});

test("STOP blocks new enqueue, claim, direct manual/scheduled runs and billable dispatch", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  await setGeminiGlobalStop(db, true, at);
  await assert.rejects(requireGeminiRunning(db),
    error => error instanceof GeminiGlobalControlError && error.code === "STOPPED");
  await assert.rejects(addJob(db), /GEMINI_GLOBAL_STOP/);
  const setting = sqlite.prepare("SELECT id FROM gemini_automation_settings").get().id;
  await assert.rejects(beginGeminiManualPilotRun(db, {
    settingId: setting, stableKey: key, model: "test", at: at.toISOString(),
    staleBefore: "2026-10-19T00:00:00Z",
  }), /GEMINI_GLOBAL_STOP/);
  await assert.rejects(db.prepare(
    "INSERT INTO gemini_automation_runs(setting_id,trigger_type,status,model,started_at) VALUES (?,'SCHEDULED','RUNNING',?,?)"
  ).bind(setting, "test", at.toISOString()).run(), /GEMINI_GLOBAL_STOP/);
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("Network must remain off"); };
  try {
    await assert.rejects(enqueueExternalGemini({ db, env, stableKey: key }),
      error => error instanceof ExternalAgentError && error.code === "BUSY");
    await assert.rejects(dispatchExternalGemini({ db, env, stableKey: key, trigger: "MANUAL", now: at }),
      error => error instanceof ExternalAgentError && error.code === "BUSY");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; sqlite.close(); }
});

test("already RUNNING jobs finish after STOP without forced Notion disruption", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  const id = await addJob(db, "RUNNING");
  await setGeminiGlobalStop(db, true, at);
  assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs WHERE id=?").get(id).status, "RUNNING");
  await db.prepare(
    "UPDATE gemini_manual_background_jobs SET status='SUCCESS',completed_at=? WHERE id=? AND status='RUNNING'"
  ).bind(at.toISOString(), id).run();
  assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs WHERE id=?").get(id).status, "SUCCESS");
  sqlite.close();
});

test("resume skips overdue planned occurrences, preserves future schedules and does not replay approvals", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  const id = await addJob(db);
  await setGeminiGlobalStop(db, true, at);
  const resumed = await setGeminiGlobalStop(db, false, later);
  assert.equal(resumed.state, "RUNNING");
  const next = sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at;
  assert.ok(next > later.toISOString(), "overdue occurrences move beyond resume time");
  assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs WHERE id=?").get(id).status, "FAILED");
  await requireGeminiRunning(db);
  const second = await setGeminiGlobalStop(db, false, later);
  assert.equal(second.revision, resumed.revision, "repeat resume does not reset schedules");
  assert.equal(sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at, next);
  sqlite.close();
});

test("STOP preserves never-due timestamps and off categories do not turn on", async () => {
  const { db, sqlite } = fixture();
  await seed(db, { enabled: false });
  sqlite.prepare("UPDATE gemini_automation_settings SET next_run_at=?").run("2026-12-01T08:00:00.000Z");
  await setGeminiGlobalStop(db, true, at);
  await setGeminiGlobalStop(db, false, later);
  assert.deepEqual({ ...sqlite.prepare("SELECT enabled,next_run_at FROM gemini_automation_settings").get() },
    { enabled: 0, next_run_at: "2026-12-01T08:00:00.000Z" });
  sqlite.close();
});

test("a competing STOP fences an in-progress resume and requires explicit retry", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  await setGeminiGlobalStop(db, true, at);
  let injected = false;
  const racing = {
    ...db,
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!sql.startsWith("UPDATE gemini_automation_settings SET next_run_at=?")) return statement;
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async run() {
          if (!injected) { injected = true; await setGeminiGlobalStop(db, true, later); }
          return statement.bind(...params).run();
        },
      };
    },
  };
  await assert.rejects(setGeminiGlobalStop(racing, false, later),
    error => error instanceof GeminiGlobalControlError && error.code === "CONFLICT");
  assert.equal((await getGeminiGlobalControl(db)).state, "STOPPED");
  assert.equal((await setGeminiGlobalStop(db, false, later)).state, "RUNNING");
  sqlite.close();
});

test("if a resume write fails, system stays RESUMING (fail closed) and can be retried", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  await setGeminiGlobalStop(db, true, at);
  sqlite.exec("CREATE TRIGGER break_resume BEFORE UPDATE ON gemini_automation_settings BEGIN SELECT RAISE(ABORT,'injected'); END");
  await assert.rejects(setGeminiGlobalStop(db, false, later), /injected/);
  assert.equal((await getGeminiGlobalControl(db)).state, "RESUMING");
  await assert.rejects(addJob(db), /GEMINI_GLOBAL_STOP/);
  sqlite.exec("DROP TRIGGER break_resume");
  assert.equal((await setGeminiGlobalStop(db, false, later)).state, "RUNNING");
  sqlite.close();
});

test("missing 0136 fails closed in API/Worker guards, not a silent enabled default", async () => {
  const { db, sqlite } = fixture(false);
  await assert.rejects(requireGeminiRunning(db),
    error => error instanceof GeminiGlobalControlError && error.code === "UNAVAILABLE");
  const worker = read("worker/index.ts");
  assert.match(worker, /geminiDispatchAllowed = await requireGeminiRunning\(env.DB\)/);
  assert.match(worker, /geminiDispatchAllowed && geminiManualBackgroundEnabled/);
  const run = read("app/api/admin/gemini-automation/run/route.ts");
  assert.match(run, /await requireGeminiRunning\(database\)/);
  sqlite.close();
});

test("control endpoint requires admin GET, CSRF mutation guard, and strict JSON payload", () => {
  const route = read("app/api/admin/gemini-automation/control/route.ts");
  assert.match(route, /await getAdminApiUser\(\)/);
  assert.match(route, /await requireAdminMutation\(request\)/);
  assert.match(route, /Object.keys\(body\).length !== 1/);
  assert.match(route, /cache-control.*no-store/);
  const ui = read("components/admin-gemini-automation-settings.tsx");
  assert.match(ui, /Aktivovať hlavný STOP/);
  assert.match(ui, /changeGlobalStop/);
  assert.match(ui, /globalRunning && available/);
  assert.match(ui, /Platený prepínač na GitHube: stav nie je/);
  const githubWorker = read("scripts/gemini-notion-agent.mjs");
  assert.match(githubWorker, /GEMINI_AGENT_PAID_ENABLED !== "true"/);
  const external = read("lib/gemini-external-agent.ts");
  assert.match(external, /Math\.min\(5, setting\.max_new_concepts\)/);
});

test("STOP is not coupled to Notion profile reconciliation or editorial synchronization", () => {
  const control = read("lib/gemini-global-control.ts");
  const migration = read("drizzle/0136_gemini_global_stop.sql");
  assert.doesNotMatch(control + migration, /notion_directory_sync|notion_event_sync|notion_help_sync|notion_pages/);
});

test("signed-worker admission is single-use, fenced by STOP and accepts only existing running job", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  assert.equal(await authorizeGeminiExternalWorker({ db, jobId: 12, stableKey: key }), false);
  const id = await addJob(db, "RUNNING");
  assert.equal(await authorizeGeminiExternalWorker({ db, jobId: id, stableKey: "help.zbierky" }), false);
  assert.equal(await authorizeGeminiExternalWorker({ db, jobId: id, stableKey: key, now: at }), true);
  assert.equal(await authorizeGeminiExternalWorker({ db, jobId: id, stableKey: key, now: at }), false,
    "replayed workflow cannot bill twice");
  assert.ok(sqlite.prepare("SELECT worker_started_at FROM gemini_manual_background_jobs WHERE id=?").get(id).worker_started_at);
  sqlite.close();
});

test("dispatched but unstarted job cannot start after STOP; historical RUNNING completion remains possible", async () => {
  const { db, sqlite } = fixture();
  await seed(db);
  const id = await addJob(db, "RUNNING");
  await setGeminiGlobalStop(db, true, at);
  assert.equal(await authorizeGeminiExternalWorker({ db, jobId: id, stableKey: key }), false);
  const now = at.toISOString();
  await db.prepare("UPDATE gemini_manual_background_jobs SET status='FAILED',completed_at=? WHERE id=?")
    .bind(now, id).run();
  assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs WHERE id=?").get(id).status, "FAILED");
  const script = read("scripts/gemini-notion-agent.mjs");
  assert.ok(script.indexOf("await authorizePaidStart();") < script.indexOf("const snapshot = await notionSnapshot("),
    "paid discovery and Notion scan require admission first");
  const endpoint = read("app/api/internal/gemini-agent/authorize/route.ts");
  assert.match(endpoint, /crypto\.subtle\.verify/);
  assert.match(endpoint, /authorizeGeminiExternalWorker/);
  sqlite.close();
});
