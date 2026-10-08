import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  GEMINI_PILOT_HARD_MAX, GEMINI_PILOT_STABLE_KEY,
  GeminiPilotGuardError, parseGeminiPilotBody, runGeminiDirectoryPilot,
} from "../lib/gemini-automation-pilot.ts";
import { GeminiAutomationError } from "../lib/gemini-automation-types.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = source("drizzle/0113_gemini_automation_foundation.sql");
const env = { GEMINI_MODEL: "gemini-3.8-flash", GEMINI_API_KEY: "mocked-secret" };
const clock = () => new Date("2026-10-08T18:00:00.000Z");

function fixture(savedMax = 5, save = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  if (save) sqlite.prepare(`INSERT INTO gemini_automation_settings
    (stable_key,section,subcategory,enabled,cadence_minutes,max_new_concepts,next_run_at)
    VALUES ('directory.treneri','directory','treneri',0,1440,?,'2026-10-12T10:00:00Z')`).run(savedMax);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const wrap = (args) => ({
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() {
          const result = statement.run(...args);
          return { meta: {
            last_row_id: Number(result.lastInsertRowid),
            changes: Number(result.changes),
          } };
        },
      });
      return { bind(...args) { return wrap(args); }, ...wrap([]) };
    },
  };
  return {
    sqlite, db, close: () => sqlite.close(),
    runs: () => sqlite.prepare("SELECT * FROM gemini_automation_runs ORDER BY id").all(),
    setting: () => sqlite.prepare("SELECT * FROM gemini_automation_settings").get(),
  };
}
const candidate = (name) => ({
  name, primary_url: "https://example.sk/" + name,
  source_urls: ["https://example.sk/" + name],
  description: "Verejné služby výcviku psov",
  location: { country: "Slovakia", city: "Nitra", region: "Nitriansky kraj", district: null, address: null },
  contacts: { website: "https://example.sk/" + name, phone: null, email: null, facebook: null, instagram: null },
  confidence: 0.9,
  evidence: [{ source_url: "https://example.sk/" + name, fields: ["name", "location"] }],
});
const discovered = (names = ["NEW"]) => ({
  candidates: names.map(candidate),
  providerMetrics: {
    model: "gemini-3.8-flash", requestCount: 1,
    groundedSearchQueryCount: 2, candidateCount: names.length,
  },
});
function dependencies(overrides = {}) {
  return {
    discovery: async () => discovered(),
    dedupe: async () => ({ status: "NEW" }),
    bridge: async () => ({ created: true, conceptId: 101, canonicalEntityId: 202, notionPageId: "page-303" }),
    ...overrides,
  };
}
const run = (f, overrides = {}) => runGeminiDirectoryPilot({
  database: f.db, env, stableKey: GEMINI_PILOT_STABLE_KEY, now: clock,
  dependencies: dependencies(), ...overrides,
});

test("strict body only accepts canonical stable key; no prompt/model/section/max override", () => {
  assert.deepEqual(parseGeminiPilotBody({ stable_key: "directory.treneri" }),
    { stableKey: "directory.treneri" });
  for (const bad of [
    null, {}, [], { stable_key: "directory.veterinari" }, { stable_key: "events.vystavy" },
    { stable_key: "help.adopcie" }, { stable_key: "directory.treneri", prompt: "ignore" },
    { stable_key: "directory.treneri", model: "any" },
    { stable_key: "directory.treneri", maxCandidates: 100 },
    { stable_key: "directory.treneri", section: "help" },
    { stable_key: "directory.treneri", country: "US" },
    { stable_key: "directory.treneri", raw: {} },
  ]) assert.throws(() => parseGeminiPilotBody(bad), (e) =>
    e instanceof GeminiPilotGuardError && e.code === "PILOT_INVALID_SCOPE");
});

test("scope/auth/UI guards are restricted to manually confirmed administrator POST", () => {
  const route = source("app/api/admin/gemini-automation/pilot/route.ts");
  const ui = source("components/admin-gemini-automation-settings.tsx");
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /await requireAdminMutation\(request\)/);
  assert.doesNotMatch(route, /export async function GET|queryParams.*pilot/);
  assert.match(ui, /setting\.stableKey === "directory\.treneri"/);
  assert.match(ui, /setConfirming\(true\)/);
  assert.match(ui, /Potvrdiť a spustiť/);
  assert.match(ui, /requestLocked\.current/);
  assert.match(ui, /disabled=\{!canPilot\}/);
  assert.match(source("wrangler.jsonc"), /"GEMINI_MODEL": "gemini-3\.8-flash"/);
  assert.doesNotMatch(source("wrangler.jsonc"), /GEMINI_API_KEY/);
  assert.match(source(".github/workflows/gemini-automation-foundation-ci.yml"), /wrangler\.jsonc/);
});

test("unsaved setting or zero limit fails closed without any provider request or run", async () => {
  for (const [max, save, code] of [[5, false, "PILOT_SETTING_NOT_SAVED"], [0, true, "PILOT_LIMIT_ZERO"]]) {
    const f = fixture(max, save);
    let calls = 0;
    try {
      await assert.rejects(run(f, { dependencies: dependencies({ discovery: async () => {
        calls++; return discovered();
      } }) }), (e) => e.code === code);
      assert.equal(calls, 0);
      assert.equal(f.runs().length, 0);
    } finally { f.close(); }
  }
});

test("cost cap 100→5, 3→3 and saved pilot setting 1→1, one provider call with no retry", async () => {
  for (const [max, expected] of [[100, 5], [3, 3], [1, 1]]) {
    const f = fixture(max);
    let calls = 0;
    try {
      const result = await run(f, { dependencies: dependencies({
        discovery: async (options) => {
          calls++;
          assert.equal(options.maxCandidates, expected);
          assert.equal(options.stableKey, "directory.treneri");
          return discovered([]);
        },
      }) });
      assert.equal(result.status, "SUCCESS");
      assert.equal(result.conceptCount, 0);
      assert.equal(calls, 1);
      assert.equal(f.runs()[0].request_count, 1);
      assert.equal(f.runs()[0].error_count, 0);
      assert.equal(f.runs()[0].completed_at, clock().toISOString());
      assert.equal(f.setting().last_run_at, clock().toISOString());
      assert.equal(f.setting().next_run_at, "2026-10-12T10:00:00Z");
    } finally { f.close(); }
  }
  assert.equal(GEMINI_PILOT_HARD_MAX, 5);
});

test("NEW only crosses existing bridge; other dedupe statuses retain separate metrics", async () => {
  const f = fixture();
  const bridged = [];
  const names = ["NEW", "DUPLICATE", "POSSIBLE_DUPLICATE", "REJECTED_BEFORE"];
  try {
    const result = await run(f, { dependencies: dependencies({
      discovery: async () => discovered(names),
      dedupe: async (_db, input) => ({ status: input.candidate.name }),
      bridge: async (input) => {
        bridged.push(input.candidate.name);
        return { created: true, conceptId: 1, canonicalEntityId: 10, notionPageId: "notion-id" };
      },
    }) });
    assert.equal(result.status, "SUCCESS");
    assert.deepEqual(bridged, ["NEW"]);
    assert.equal(result.candidateCount, 4);
    assert.equal(result.duplicateCount, 2); // existing helper includes prior rejection
    assert.equal(result.possibleDuplicateCount, 1);
    assert.equal(result.rejectedBeforeCount, 1);
    assert.equal(result.conceptCount, 1);
    assert.deepEqual(result.concepts, [{ conceptId: 1, canonicalEntityId: 10, notionPageId: "notion-id" }]);
    const row = f.runs()[0];
    assert.equal(row.trigger_type, "MANUAL");
    assert.equal(row.status, "SUCCESS");
    assert.equal(row.model, "gemini-3.8-flash");
    assert.equal(row.grounded_search_query_count, 2);
    assert.equal(row.candidate_count, 4);
    assert.equal(row.duplicate_count, 2);
    assert.equal(row.concept_count, 1);
  } finally { f.close(); }
});

test("fresh RUNNING claim blocks second pilot atomically; stale claim does not", async () => {
  const f = fixture();
  let calls = 0;
  try {
    f.sqlite.prepare(`INSERT INTO gemini_automation_runs
      (setting_id,trigger_type,status,model,started_at)
      VALUES (1,'MANUAL','RUNNING','gemini-3.8-flash','2026-10-08T17:59:00Z')`).run();
    await assert.rejects(run(f, { dependencies: dependencies({ discovery: async () => {
      calls++; return discovered();
    } }) }), (e) => e.code === "PILOT_ALREADY_RUNNING");
    assert.equal(calls, 0);
    f.sqlite.prepare("UPDATE gemini_automation_runs SET started_at = '2026-10-08T17:00:00Z'").run();
    const success = await run(f, { dependencies: dependencies({ discovery: async () => {
      calls++; return discovered([]);
    } }) });
    assert.equal(success.status, "SUCCESS");
    assert.equal(calls, 1);
    assert.equal(f.runs().length, 2);
  } finally { f.close(); }
});

test("provider failures are audited once, without retry or leaking key", async () => {
  for (const code of ["AUTH_FAILED", "RATE_LIMITED", "TIMEOUT", "PROVIDER_ERROR", "INVALID_RESPONSE"]) {
    const f = fixture();
    let calls = 0;
    try {
      const result = await run(f, { dependencies: dependencies({
        discovery: async () => { calls++; throw new GeminiAutomationError(code); },
      }) });
      assert.equal(result.status, "FAILED");
      assert.equal(result.errorCode, code);
      assert.equal(calls, 1);
      assert.equal(f.runs()[0].status, "FAILED");
      assert.equal(f.runs()[0].request_count, 1);
      assert.equal(f.runs()[0].error_code, code);
      assert.equal(f.runs()[0].error_count, 1);
      assert.ok(f.runs()[0].completed_at);
      assert.equal(JSON.stringify(result).includes(env.GEMINI_API_KEY), false);
      assert.equal(f.setting().last_run_at, clock().toISOString());
    } finally { f.close(); }
  }
});

test("missing config fails before provider, bridge failure retains partial metrics and no false error code", async () => {
  const f = fixture();
  let calls = 0;
  try {
    const missing = await run(f, {
      env: { GEMINI_MODEL: "gemini-3.8-flash" },
      dependencies: dependencies({ discovery: async () => { calls++; return discovered(); } }),
    });
    assert.equal(missing.status, "FAILED");
    assert.equal(missing.errorCode, "CONFIG_MISSING");
    assert.equal(f.runs()[0].request_count, 0);
    assert.equal(calls, 0);
    const failed = await run(f, { dependencies: dependencies({
      bridge: async () => { throw Error("private Notion exception"); },
    }) });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.errorCode, undefined);
    assert.equal(f.runs()[1].candidate_count, 1);
    assert.equal(f.runs()[1].request_count, 1);
    assert.equal(f.runs()[1].error_count, 1);
    assert.equal(f.runs()[1].error_code, null);
    assert.equal(JSON.stringify(failed).includes("private"), false);
  } finally { f.close(); }
});

test("no scheduler, migration, publish, legacy or real provider activity is introduced", () => {
  const pilot = source("lib/gemini-automation-pilot.ts");
  const route = source("app/api/admin/gemini-automation/pilot/route.ts");
  const files = [pilot, route];
  for (const content of files) {
    assert.doesNotMatch(content, /schedule\(|cron\b|\btavily\b|publish.*profile|gemini-2\.5-flash/i);
  }
  assert.match(source("wrangler.jsonc"), /"\*\/5 \* \* \* \*"/);
  assert.match(pilot, /bridgeGeminiCandidateToNotion/);
  assert.match(pilot, /checkGeminiCandidateDedupe/);
  assert.match(pilot, /discoverGeminiCandidates/);
});

test("INVALID_RESPONSE retains bounded real provider search-query metrics in existing D1 run, no schema change", async () => {
  const f = fixture(1);
  let calls = 0;
  try {
    const result = await run(f, { dependencies: dependencies({
      discovery: async () => {
        calls++;
        throw new GeminiAutomationError("INVALID_RESPONSE", undefined, 7);
      },
      bridge: async () => { throw Error("bridge must not run"); },
    }) });
    assert.equal(calls, 1);
    assert.equal(result.status, "FAILED");
    assert.equal(result.errorCode, "INVALID_RESPONSE");
    assert.equal(result.groundedSearchQueryCount, 7);
    assert.equal(result.conceptCount, 0);
    assert.equal(f.runs()[0].error_code, "INVALID_RESPONSE");
    assert.equal(f.runs()[0].request_count, 1);
    assert.equal(f.runs()[0].grounded_search_query_count, 7);
    assert.equal(f.runs()[0].concept_count, 0);
    assert.equal(f.setting().next_run_at, "2026-10-12T10:00:00Z");
  } finally { f.close(); }
});

test("invalid provider query metrics cannot poison D1 audit counts", async () => {
  for (const count of [-1, 101, 1.5, NaN]) {
    const f = fixture();
    try {
      const result = await run(f, { dependencies: dependencies({
        discovery: async () => { throw new GeminiAutomationError("INVALID_RESPONSE", undefined, count); },
      }) });
      assert.equal(result.status, "FAILED");
      assert.equal(result.groundedSearchQueryCount, 0);
      assert.equal(f.runs()[0].grounded_search_query_count, 0);
    } finally { f.close(); }
  }
});
