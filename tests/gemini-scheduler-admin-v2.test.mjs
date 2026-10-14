import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { externalWorkerCategorySupported } from "../scripts/gemini-notion-category.mjs";
import { geminiSettingViews, parseGeminiSettingsInput } from "../lib/gemini-automation-admin-settings.ts";
import { saveGeminiSetting } from "../lib/gemini-automation-admin-store.ts";
import {
  recommendedGeminiCadence, geminiSchedulerOptions, nextGeminiRunAt,
} from "../lib/gemini-automation-schedule.ts";
import {
  dispatchExternalGemini, sweepExternalGemini, completeExternalGemini, ExternalAgentError,
} from "../lib/gemini-external-agent.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const env = {
  GEMINI_EXTERNAL_AGENT_ENABLED: "true",
  GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  GITHUB_ACTIONS_DISPATCH_TOKEN: "offline-only",
  GEMINI_AGENT_CALLBACK_SECRET: "offline-callback-secret",
};
const now = new Date("2026-10-14T08:00:00.000Z");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0113_gemini_automation_foundation.sql",
    "0119_gemini_manual_background_jobs.sql", "0126_gemini_scheduler_admin_v2.sql"]) {
    sqlite.exec(read("drizzle/" + file));
  }
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let bindings = [];
      const bound = {
        bind(...args) { bindings = args; return bound; },
        async first() { return stmt.get(...bindings) ?? null; },
        async all() { return { results: stmt.all(...bindings) }; },
        async run() {
          const result = stmt.run(...bindings);
          return { meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return bound;
    },
  };
  return { sqlite, db };
}
function populate(db, catalog = geminiAutomationCatalog) {
  return Promise.all(catalog.map(item => saveGeminiSetting(db, {
    stableKey: item.stableKey, enabled: false, cadenceMinutes: recommendedGeminiCadence(item.stableKey),
    weeklyDay: null, maxNewConcepts: 5,
  }, now)));
}
async function finished(db, jobId, status = "SUCCESS", error_code = null) {
  const body = JSON.stringify({
    job_id: jobId, status, concept_count: status === "SUCCESS" ? 1 : 0,
    duplicate_count: 0, request_count: 3, search_count: 1, error_code,
  });
  const signature = "sha256=" + createHmac("sha256", env.GEMINI_AGENT_CALLBACK_SECRET)
    .update(body).digest("hex");
  return completeExternalGemini({ db, env, body, signature });
}
async function noNetwork(fn) {
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /github\.com\/repos\/investradarsk\/psipedia-sk\/actions\/workflows/);
    attempts++;
    return new Response(null, { status: 204 });
  };
  try { return { result: await fn(), attempts }; }
  finally { globalThis.fetch = original; }
}
test("22 exact category recommendations, defaults disabled; existing choices preserved", async () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.equal(new Set(geminiAutomationCatalog.map(item => item.stableKey)).size, 22);
  assert.equal(Object.keys(Object.fromEntries(geminiAutomationCatalog.map(item =>
    [item.stableKey, recommendedGeminiCadence(item.stableKey)]))).length, 22);
  assert.deepEqual(geminiSchedulerOptions.map(option => option.minutes),
    [1440, 2880, 4320, 7200, 10080, 20160, 43200]);
  const all = geminiSettingViews([]);
  assert.ok(all.every(item => !item.enabled && !item.saved && item.nextRunAt === null &&
    item.cadenceMinutes === recommendedGeminiCadence(item.stableKey)));
  const { sqlite, db } = fixture();
  await saveGeminiSetting(db, { stableKey: "directory.veterinari", enabled: true,
    cadenceMinutes: 4320, weeklyDay: null, maxNewConcepts: 4 }, now);
  const unchangedDue = sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at;
  await saveGeminiSetting(db, { stableKey: "directory.veterinari", enabled: true,
    cadenceMinutes: 4320, weeklyDay: null, maxNewConcepts: 2 }, new Date(now.getTime() + 60000));
  assert.equal(sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at, unchangedDue);
  assert.equal(sqlite.prepare("SELECT max_new_concepts FROM gemini_automation_settings").get().max_new_concepts, 2);
  sqlite.close();
});

test("custom intervals, ISO weekdays, and Bratislava DST stay valid", () => {
  const key = "events.vystavy";
  const valid = (cadence, weekday = null) =>
    parseGeminiSettingsInput({ stable_key: key, enabled: true, cadence_minutes: cadence,
      weekly_day: weekday, max_new_concepts: 5 });
  for (const cadence of [5, 1440, 2880, 4320, 7200, 10080, 20160, 43200]) {
    assert.equal(valid(cadence).cadenceMinutes, cadence);
  }
  for (let day = 1; day <= 7; day++) assert.equal(valid(10080, day).weeklyDay, day);
  for (const day of [0, 8, 1.5, "2"]) assert.throws(() => valid(10080, day));
  assert.throws(() => valid(1440, 1));
  assert.equal(nextGeminiRunAt(new Date("2026-03-28T08:00:00Z"), 1440, null),
    "2026-03-29T07:00:00.000Z");
  assert.equal(nextGeminiRunAt(new Date("2026-10-24T07:00:00Z"), 1440, null),
    "2026-10-25T08:00:00.000Z");
  assert.equal(nextGeminiRunAt(new Date("2026-10-14T08:00:00Z"), 10080, 1),
    "2026-10-19T07:00:00.000Z");
  assert.equal(nextGeminiRunAt(new Date("2026-10-14T08:00:00Z"), 4320, null,
    new Date("2026-11-01T08:00:00Z")), "2026-11-01T09:00:00.000Z");
});

test("all 22 due together: one dispatch at a time, no duplicate, no missed supported category", async () => {
  const { sqlite, db } = fixture();
  await populate(db);
  sqlite.exec("UPDATE gemini_automation_settings SET enabled=1,next_run_at='2026-10-14T07:00:00.000Z'");
  const readyCount = geminiAutomationCatalog.filter(x => externalWorkerCategorySupported(x.stableKey)).length;
  const { result, attempts } = await noNetwork(async () => {
    const processed = [];
    for (let index = 0; index < readyCount; index++) {
      const swept = await sweepExternalGemini({ db, env, now });
      assert.deepEqual(swept, { dispatched: 1 });
      const active = sqlite.prepare("SELECT id, stable_key FROM gemini_manual_background_jobs WHERE status='RUNNING'").get();
      assert.ok(active);
      assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM gemini_manual_background_jobs WHERE status='RUNNING'").get().n, 1);
      assert.deepEqual(await sweepExternalGemini({ db, env, now }), { dispatched: 0, reason: "BUSY" });
      processed.push(active.stable_key);
      assert.deepEqual(await finished(db, active.id), { status: 200, ok: true });
    }
    assert.equal(new Set(processed).size, readyCount);
    return processed;
  });
  assert.equal(result.length, readyCount);
  assert.equal(attempts, readyCount);
  const unresolved = geminiAutomationCatalog.filter(x => !externalWorkerCategorySupported(x.stableKey));
  for (const item of unresolved) {
    assert.equal(sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings WHERE stable_key=?")
      .get(item.stableKey).next_run_at, "2026-10-14T07:00:00.000Z");
  }
  assert.equal((await sweepExternalGemini({ db, env, now })).dispatched, 0);
  sqlite.close();
});

test("22 category admin controls share one safe external route; manual jobs not capped monthly", async () => {
  const cards = read("components/admin-gemini-automation-settings.tsx");
  assert.match(cards, /settings\.filter\(\(item\) => item\.section === section\.key\)/);
  assert.match(cards, /Spustiť vyhľadávanie teraz/);
  assert.match(cards, /Upraviť prompt/);
  assert.match(cards, /weekly_day: weeklyDay/);
  const { sqlite, db } = fixture();
  await populate(db);
  const supported = geminiAutomationCatalog.filter(x => externalWorkerCategorySupported(x.stableKey));
  const { attempts } = await noNetwork(async () => {
    for (let index = 0; index < 11; index++) {
      const key = supported[index % supported.length].stableKey;
      const job = await dispatchExternalGemini({ db, env, stableKey: key, trigger: "MANUAL", now });
      assert.deepEqual(await finished(db, job.jobId), { status: 200, ok: true });
    }
  });
  assert.equal(attempts, 11);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM gemini_manual_background_jobs").get().n, 11);
  assert.doesNotMatch(read("lib/gemini-external-agent.ts"), /COUNT\(\*\).*gemini_manual_background_jobs|monthly request fuse|BUDGET/);
  sqlite.close();
});

test("failed category advances exactly one occurrence, releases lock and next due runs", async () => {
  const { sqlite, db } = fixture();
  const supported = geminiAutomationCatalog.filter(x => externalWorkerCategorySupported(x.stableKey)).slice(0, 2);
  await populate(db, supported);
  sqlite.exec("UPDATE gemini_automation_settings SET enabled=1,next_run_at='2026-10-14T07:00:00.000Z'");
  await noNetwork(async () => {
    assert.equal((await sweepExternalGemini({ db, env, now })).dispatched, 1);
    const running = sqlite.prepare("SELECT id,stable_key FROM gemini_manual_background_jobs WHERE status='RUNNING'").get();
    assert.deepEqual(await finished(db, running.id, "FAILED", "RATE_LIMITED"), { status: 200, ok: true });
    assert.equal(sqlite.prepare("SELECT error_code FROM gemini_automation_runs").get().error_code, "RATE_LIMITED");
    assert.equal((await sweepExternalGemini({ db, env, now })).dispatched, 1);
    const next = sqlite.prepare("SELECT stable_key FROM gemini_manual_background_jobs WHERE status='RUNNING'").get();
    assert.notEqual(running.stable_key, next.stable_key);
  });
  sqlite.close();
});

test("timeout outcome stays RUNNING without paid retries; scheduled global kill switch holds", async () => {
  const { sqlite, db } = fixture();
  await populate(db, geminiAutomationCatalog.filter(x => externalWorkerCategorySupported(x.stableKey)).slice(0, 1));
  sqlite.exec("UPDATE gemini_automation_settings SET enabled=1,next_run_at='2026-10-14T07:00:00.000Z'");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("uncertain GitHub timeout"); };
  try {
    assert.deepEqual(await sweepExternalGemini({ db, env, now }), { dispatched: 0, reason: "DISPATCH" });
    assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs").get().status, "RUNNING");
    assert.notEqual(sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings").get().next_run_at,
      "2026-10-14T07:00:00.000Z");
    assert.equal((await sweepExternalGemini({ db, env, now })).reason, "BUSY");
    assert.equal(calls, 1);
    assert.deepEqual(await sweepExternalGemini({ db, env: { ...env,
      GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "false" }, now }), {
      dispatched: 0, reason: "SCHEDULE_DISABLED",
    });
    const after2h = new Date(now.getTime() + 3 * 60 * 60_000);
    assert.equal((await sweepExternalGemini({ db, env, now: after2h })).reason, "STALLED_REVIEW");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test("disabled category stays idle and rejected GitHub request is not automatically retried", async () => {
  const { sqlite, db } = fixture();
  await populate(db, geminiAutomationCatalog.filter(x => externalWorkerCategorySupported(x.stableKey)).slice(0, 1));
  assert.equal((await sweepExternalGemini({ db, env, now })).dispatched, 0);
  sqlite.exec("UPDATE gemini_automation_settings SET enabled=1,next_run_at='2026-10-14T07:00:00.000Z'");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 422 }); };
  try {
    assert.deepEqual(await sweepExternalGemini({ db, env, now }), { dispatched: 0, reason: "DISPATCH" });
    assert.equal(sqlite.prepare("SELECT status FROM gemini_manual_background_jobs").get().status, "FAILED");
    assert.equal((await sweepExternalGemini({ db, env, now })).dispatched, 0);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});
