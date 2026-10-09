import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { directoryCategories } from "../lib/directory.ts";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import {
  GEMINI_DIRECTORY_HARD_MAX, GeminiPilotGuardError,
  parseGeminiDirectoryRunBody, runGeminiDirectoryCategory,
} from "../lib/gemini-automation-pilot.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const env = { GEMINI_API_KEY: "fake-key", GEMINI_MODEL: "gemini-3.8-flash" };
const now = () => new Date("2026-10-09T20:00:00Z");
const candidate = (name) => ({
  name, primary_url: "https://example.sk/" + encodeURIComponent(name),
  source_urls: ["https://example.sk/" + encodeURIComponent(name)],
  description: "Informácie z verejných zdrojov",
  location: { country: "Slovakia", region: "Nitriansky kraj", district: null, city: "Nitra", address: null },
  contacts: { phone: null, email: null, website: "https://example.sk", facebook: null, instagram: null },
  confidence: 0.9,
  evidence: [{ source_url: "https://example.sk", fields: ["name", "location"] }],
});
const discovered = (names = []) => ({
  candidates: names.map(candidate),
  providerMetrics: { model: "gemini-3.8-flash", requestCount: 1,
    groundedSearchQueryCount: 2, candidateCount: names.length },
});
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(source("drizzle/0113_gemini_automation_foundation.sql"));
  sqlite.exec(source("drizzle/0114_gemini_dedupe.sql"));
  sqlite.exec(`CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL, status TEXT NOT NULL, name TEXT NOT NULL,
    city TEXT, website_url TEXT)`);
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    const methods = (args) => ({
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args) }; },
      async run() {
        const r = statement.run(...args);
        return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
      },
    });
    return { bind(...args) { return methods(args); }, ...methods([]) };
  } };
  const save = (key, max = 5) => sqlite.prepare(`INSERT INTO gemini_automation_settings
    (stable_key,section,subcategory,enabled,cadence_minutes,max_new_concepts,next_run_at)
    VALUES (?, 'directory', ?, 0, 1440, ?, '2026-10-12T10:00:00Z')`)
    .run(key, key.slice("directory.".length), max);
  const run = (key, dependencies, extra = {}) => runGeminiDirectoryCategory({
    database: db, env, stableKey: key, now, dependencies, ...extra,
  });
  return { sqlite, db, save, run, close: () => sqlite.close() };
}
function deps(overrides = {}) {
  return {
    discovery: async () => discovered(),
    dedupe: async () => ({ status: "NEW" }),
    bridge: async () => ({
      created: true, conceptId: 7, canonicalEntityId: 9, notionPageId: "linked-page",
    }),
    ...overrides,
  };
}
test("canonical directory catalog keys all accepted; other section and client injection rejected", async () => {
  const expected = directoryCategories.map((item) => "directory." + item.slug);
  const actual = geminiAutomationCatalog.filter((v) => v.section === "directory").map((v) => v.stableKey);
  assert.deepEqual(actual, expected);
  for (const stable_key of expected) {
    assert.deepEqual(parseGeminiDirectoryRunBody({ stable_key }), { stableKey: stable_key });
  }
  for (const payload of [
    null, {}, [], { stable_key: "directory.fake" }, { stable_key: "directory.psie-skoly" },
    { stable_key: "events.vystavy" }, { stable_key: "help.adopcie" },
    { stable_key: "directory.treneri", prompt: "injection" },
    { stable_key: "directory.treneri", model: "custom" },
    { stable_key: "directory.treneri", maxCandidates: 10 },
    { stable_key: "directory.treneri", subcategory: "fake" },
    { stable_key: "directory.treneri", section: "help" },
  ]) assert.throws(() => parseGeminiDirectoryRunBody(payload), (e) =>
    e instanceof GeminiPilotGuardError && e.code === "PILOT_INVALID_SCOPE");
  const f = fixture();
  try {
    let discoveryCalls = 0;
    const injected = deps({ discovery: async () => { discoveryCalls++; return discovered(); } });
    await assert.rejects(f.run("events.vystavy", injected), (e) => e.code === "PILOT_INVALID_SCOPE");
    await assert.rejects(f.run("directory.fake", injected), (e) => e.code === "PILOT_INVALID_SCOPE");
    assert.equal(discoveryCalls, 0);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM gemini_automation_runs").get().n, 0);
  } finally { f.close(); }
});
test("generic veterinarian flow uses same-category memory and rejection memory, only one provider call", async () => {
  const f = fixture();
  try {
    f.save("directory.veterinari", 1);
    f.sqlite.prepare("INSERT INTO directory_profiles (category,status,name,city,website_url) VALUES (?,?,?,?,?)")
      .run("veterinari", "draft", "Veterina Alfa – Nitra", "Nitra", "https://vet.sk");
    f.sqlite.prepare("INSERT INTO directory_profiles (category,status,name,city,website_url) VALUES (?,?,?,?,?)")
      .run("treneri", "published", "Tréner Beta", "Bratislava", "https://trener.sk");
    const reject = f.sqlite.prepare(`INSERT INTO gemini_automation_rejections
      (stable_key,identity_kind,identity_hash,candidate_name,rejected_at,updated_at)
      VALUES (?, 'name_city', ?, ?, '2026-10-09', '2026-10-09')`);
    reject.run("directory.veterinari", "a".repeat(64), "Veterinár odmietnutý");
    reject.run("directory.treneri", "b".repeat(64), "Tréner odmietnutý");
    let calls = 0;
    const seen = [];
    const result = await f.run("directory.veterinari", deps({
      discovery: async (args) => {
        calls++;
        assert.equal(args.stableKey, "directory.veterinari");
        assert.equal(args.maxCandidates, 1);
        seen.push(...JSON.parse(args.knownContext.serialized));
        return discovered(["Nová klinika"]);
      },
      dedupe: async (_db, input) => {
        assert.equal(input.stableKey, "directory.veterinari");
        assert.equal(input.subcategory, "veterinari");
        return { status: "NEW" };
      },
      bridge: async (input) => {
        assert.equal(input.stableKey, "directory.veterinari");
        return { created: true, conceptId: 7, canonicalEntityId: 9, notionPageId: "linked-page" };
      },
    }));
    assert.equal(calls, 1);
    assert.deepEqual(seen.map((v) => v.name), ["Veterina Alfa – Nitra", "Veterinár odmietnutý"]);
    assert.equal(result.conceptCount, 1);
    assert.equal(result.status, "SUCCESS");
    assert.equal(f.sqlite.prepare("SELECT request_count FROM gemini_automation_runs").get().request_count, 1);
  } finally { f.close(); }
});
test("saved concept limits 1,5,100 resolve to effective 1,5,5 for every directory key", async () => {
  assert.equal(GEMINI_DIRECTORY_HARD_MAX, 5);
  for (const [max, effective] of [[1,1],[5,5],[100,5]]) {
    const f = fixture();
    try {
      f.save("directory.salony-a-sluzby", max);
      let calls = 0;
      const res = await f.run("directory.salony-a-sluzby", deps({
        discovery: async (options) => {
          calls++;
          assert.equal(options.maxCandidates, effective);
          return discovered();
        },
      }));
      assert.equal(res.status, "SUCCESS");
      assert.equal(calls, 1);
    } finally { f.close(); }
  }
});
test("unsaved/zero settings fail closed; concurrency lock is category-specific and does not touch scheduler", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const d = deps({ discovery: async () => { calls++; return discovered(); } });
    await assert.rejects(f.run("directory.vencenie", d), (e) => e.code === "PILOT_SETTING_NOT_SAVED");
    f.save("directory.vencenie", 0);
    await assert.rejects(f.run("directory.vencenie", d), (e) => e.code === "PILOT_LIMIT_ZERO");
    f.save("directory.treneri", 1);
    f.save("directory.veterinari", 1);
    f.sqlite.prepare(`INSERT INTO gemini_automation_runs
      (setting_id,trigger_type,status,model,started_at)
      SELECT id,'MANUAL','RUNNING','gemini-3.8-flash',? FROM gemini_automation_settings WHERE stable_key=?`)
      .run("2026-10-09T19:59:00Z", "directory.treneri");
    await assert.rejects(f.run("directory.treneri", d), (e) => e.code === "PILOT_ALREADY_RUNNING");
    assert.equal((await f.run("directory.veterinari", d)).status, "SUCCESS");
    assert.equal(calls, 1);
    assert.equal(f.sqlite.prepare("SELECT last_run_at FROM gemini_automation_settings WHERE stable_key='directory.treneri'").get().last_run_at, null);
    assert.equal(f.sqlite.prepare("SELECT next_run_at FROM gemini_automation_settings WHERE stable_key='directory.veterinari'").get().next_run_at, "2026-10-12T10:00:00Z");
  } finally { f.close(); }
});
test("duplicate/possible/rejected produce no concept; NEW uses original bridge only", async () => {
  const f = fixture();
  try {
    f.save("directory.fyzioterapia", 5);
    const bridged = [];
    const result = await f.run("directory.fyzioterapia", deps({
      discovery: async () => discovered(["NEW","DUPLICATE","POSSIBLE_DUPLICATE","REJECTED_BEFORE"]),
      dedupe: async (_db, input) => ({ status: input.candidate.name }),
      bridge: async (input) => {
        bridged.push(input.candidate.name);
        return { created: true, conceptId: 1, canonicalEntityId: 2, notionPageId: "notion" };
      },
    }));
    assert.deepEqual(bridged, ["NEW"]);
    assert.equal(result.candidateCount, 4);
    assert.equal(result.conceptCount, 1);
    assert.equal(result.duplicateCount, 2);
    assert.equal(result.possibleDuplicateCount, 1);
    assert.equal(result.rejectedBeforeCount, 1);
  } finally { f.close(); }
});
test("manual API requires auth, no injected prompts; UI only renders manual controls for directory", () => {
  const route = source("app/api/admin/gemini-automation/run/route.ts");
  const ui = source("components/admin-gemini-automation-settings.tsx");
  const page = source("app/admin/automatizacie-gemini/page.tsx");
  assert.match(route, /await requireAdminMutation\(request\)/);
  assert.match(route, /parseGeminiDirectoryRunBody/);
  assert.match(route, /runGeminiDirectoryCategory/);
  assert.match(ui, /setting\.section === "directory"/);
  assert.match(ui, /setting\.saved && !unsavedChanges/);
  assert.match(ui, /requestLocked\.current/);
  assert.match(ui, /setConfirming\(true\)/);
  assert.match(ui, /Potvrdiť a spustiť/);
  assert.match(ui, /body: JSON\.stringify\(\{ stable_key: setting\.stableKey \}\)/);
  assert.match(ui, /disabled=\{!canPilot\}/);
  assert.doesNotMatch(page, /Tavily|auto-publish/i);
  assert.doesNotMatch(route, /runScheduledGemini|autoPublish|retryGemini|cronHandler/i);
});
