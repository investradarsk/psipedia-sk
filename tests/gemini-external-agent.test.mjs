import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { eventTypeFromPortalSlug } from "../lib/events.ts";
import { notionCategoryValue } from "../scripts/gemini-notion-category.mjs";
import { readFileSync } from "node:fs";
import {
  externalAgentEnabled, externalAgentScheduledEnabled, ExternalAgentError, dispatchExternalGemini,
  sweepExternalGemini, completeExternalGemini,
} from "../lib/gemini-external-agent.ts";

function fakeDb() {
  let job = null;
  const runs = [];
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() {
          if (sql.includes("FROM gemini_automation_settings")) {
            if (sql.includes("next_run_at")) return { stable_key: "directory.veterinari" };
            return { id: 42, max_new_concepts: 8, cadence_minutes: 720 };
          }
          if (sql.includes("FROM gemini_manual_background_jobs")) return job;
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO gemini_manual_background_jobs")) {
            if (job && job.status === "RUNNING") throw Error("busy");
            job = { id: 7, setting_id: 42, stable_key: args[1],
              status: "RUNNING", error_code: args[2] };
            return { meta: { changes: 1, last_row_id: 7 } };
          }
          if (sql.includes("UPDATE gemini_manual_background_jobs SET status=")) {
            if (!job || job.status !== "RUNNING") return { meta: { changes: 0 } };
            job.status = args[0];
            job.error_code = args[1];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO gemini_automation_runs")) {
            runs.push(args);
            return { meta: { changes: 1, last_row_id: 21 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db, queries, runs, getJob: () => job };
}

test("external agent remains entirely off by default and avoids all external traffic", async () => {
  assert.equal(externalAgentEnabled({}), false);
  assert.equal(externalAgentEnabled({ GEMINI_EXTERNAL_AGENT_ENABLED: "false" }), false);
  const { db, queries } = fakeDb();
  assert.deepEqual(await sweepExternalGemini({ db, env: {} }), { dispatched: 0, reason: "DISABLED" });
  assert.equal(queries.length, 0);
  await assert.rejects(
    dispatchExternalGemini({ db, env: {}, stableKey: "directory.veterinari", trigger: "MANUAL" }),
    (error) => error instanceof ExternalAgentError && error.code === "DISABLED",
  );
});

test("external dispatch sends only bounded routing metadata to GitHub (no data processing in Psipedia)", async () => {
  const { db, getJob } = fakeDb();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  try {
    const category = geminiAutomationCatalog.find((item) => item.section === "directory").stableKey;
    const result = await dispatchExternalGemini({
      db, env: {
        GEMINI_EXTERNAL_AGENT_ENABLED: "true",
        GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
        GEMINI_AGENT_CALLBACK_SECRET: "callback-secret",
      },
      stableKey: category, trigger: "MANUAL",
      now: new Date("2026-10-11T20:00:00.000Z"),
    });
    assert.deepEqual(result, { jobId: 7, status: "QUEUED" });
    assert.equal(getJob().status, "RUNNING");
    assert.equal(getJob().error_code, "EXT_MANUAL");
    assert.match(String(request.url), /actions\/workflows\/gemini-notion-agent\.yml\/dispatches$/);
    const parsed = JSON.parse(request.options.body);
    assert.equal(parsed.ref, "main");
    assert.deepEqual(Object.keys(parsed.inputs).sort(),
      ["job_id", "max_new_concepts", "stable_key", "trigger_type"].sort());
    assert.equal(parsed.inputs.max_new_concepts, "5");
    assert.doesNotMatch(request.options.body, /GEMINI_API_KEY|NOTION_API_TOKEN|https:\/\/api.notion.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callback rejects missing signature, then accepts exactly one signed completion", async () => {
  const { db, getJob, runs } = fakeDb();
  const category = geminiAutomationCatalog.find((item) => item.section === "directory").stableKey;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  const config = {
    GEMINI_EXTERNAL_AGENT_ENABLED: "true",
    GITHUB_ACTIONS_DISPATCH_TOKEN: "github-secret",
    GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
  };
  try {
    await dispatchExternalGemini({ db, env: config, stableKey: category, trigger: "MANUAL" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const body = JSON.stringify({
    job_id: 7, status: "SUCCESS", concept_count: 2, duplicate_count: 3,
    request_count: 5, search_count: 6, error_code: null,
  });
  assert.equal((await completeExternalGemini({ db, env: config, body, signature: null })).status, 401);
  assert.equal(getJob().status, "RUNNING");
  const signature = "sha256=" + createHmac("sha256", "hmac-test-secret").update(body).digest("hex");
  assert.deepEqual(await completeExternalGemini({ db, env: config, body, signature }),
    { status: 200, ok: true });
  assert.equal(getJob().status, "SUCCESS");
  assert.equal(runs.length, 1);
  assert.equal(runs[0][10], 2);
  assert.equal((await completeExternalGemini({ db, env: config, body, signature })).status, 409);
});

test("manual external opt-in never starts a scheduled job without separate consent", async () => {
  const { db, queries } = fakeDb();
  const env = {
    GEMINI_EXTERNAL_AGENT_ENABLED: "true",
    GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
    GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
  };
  assert.equal(externalAgentEnabled(env), true);
  assert.equal(externalAgentScheduledEnabled(env), false);
  assert.deepEqual(await sweepExternalGemini({ db, env }), {
    dispatched: 0, reason: "SCHEDULE_DISABLED",
  });
  assert.equal(queries.length, 0, "No database job should be reserved");
  await assert.rejects(
    dispatchExternalGemini({ db, env, stableKey: "directory.veterinari", trigger: "SCHEDULED" }),
    (error) => error instanceof ExternalAgentError && error.code === "DISABLED",
  );
  assert.equal(queries.length, 0);
  assert.equal(externalAgentScheduledEnabled({
    ...env, GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  }), true);
  assert.equal(externalAgentScheduledEnabled({
    ...env, GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "false",
  }), false);
  assert.equal(externalAgentScheduledEnabled({
    GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  }), false, "Schedule alone must never enable the external worker");
});

test("explicit scheduled opt-in dispatches only one bounded job", async () => {
  const { db, getJob } = fakeDb();
  const originalFetch = globalThis.fetch;
  let dispatches = 0;
  globalThis.fetch = async () => {
    dispatches++;
    return new Response(null, { status: 204 });
  };
  try {
    const result = await sweepExternalGemini({ db, env: {
      GEMINI_EXTERNAL_AGENT_ENABLED: "true",
      GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
      GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
      GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
    }, now: new Date("2026-10-12T01:00:00.000Z") });
    assert.deepEqual(result, { dispatched: 1 });
    assert.equal(dispatches, 1);
    assert.equal(getJob().error_code, "EXT_SCHEDULED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Notion category values preserve directory slugs and canonical singular event types", () => {
  for (const item of geminiAutomationCatalog) {
    const expected = item.section === "events"
      ? eventTypeFromPortalSlug(item.subcategory) : item.subcategory;
    assert.ok(expected, "Unknown catalog type: " + item.stableKey);
    assert.equal(notionCategoryValue(item.section, item.subcategory), expected, item.stableKey);
  }
  assert.equal(notionCategoryValue("events", "vystavy"), "Výstava");
  assert.equal(notionCategoryValue("directory", "veterinari"), "veterinari");
  assert.equal(notionCategoryValue("events", "unknown"), null);
  assert.equal(notionCategoryValue("events", "../../secret"), null);
  const worker = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(worker, /notionCategoryValue\(section, subcategory\)/);
  assert.match(worker, /"Typ podujatia": target\.categoryValue/);
  assert.match(worker, /"Kategória": target\.categoryValue/);
});

