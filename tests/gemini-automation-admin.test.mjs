import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { directoryCategories } from "../lib/directory.ts";
import { eventTypes, eventPortalCategory } from "../lib/events.ts";
import { helpCategories } from "../lib/help.ts";
import {
  geminiAutomationCatalog, geminiAutomationSections,
  getGeminiCatalogItem, geminiCadenceOptions,
} from "../lib/gemini-automation-catalog.ts";
import {
  GeminiSettingsValidationError, parseGeminiSettingsInput,
} from "../lib/gemini-automation-admin-settings.ts";
import {
  getGeminiSetting, listGeminiSettings, listRecentGeminiRuns, saveGeminiSetting,
} from "../lib/gemini-automation-admin-store.ts";
import { classifyChangedFiles } from "../scripts/ci-scope.mjs";
import { findActiveAdminNavigationItem, getAdminBreadcrumbs } from "../lib/admin-navigation.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = source("drizzle/0113_gemini_automation_foundation.sql");

/** D1-like asynchronous adapter around the real, constraint-enforcing SQLite schema. */
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  return {
    sqlite,
    db: {
      prepare(sql) {
        return {
          bind(...parameters) {
            const statement = sqlite.prepare(sql);
            return {
              async first() { return statement.get(...parameters) ?? null; },
              async all() { return { results: statement.all(...parameters) }; },
              async run() {
                const result = statement.run(...parameters);
                return { meta: { last_row_id: Number(result.lastInsertRowid) } };
              },
            };
          },
          async all() { return { results: sqlite.prepare(sql).all() }; },
        };
      },
    },
  };
}

function valid(overrides = {}) {
  return {
    stable_key: geminiAutomationCatalog[0].stableKey,
    enabled: false, cadence_minutes: 1440, max_new_concepts: 5,
    ...overrides,
  };
}

test("A: legacy and Gemini navigation are separate with correct active paths and breadcrumbs", () => {
  assert.equal(findActiveAdminNavigationItem("/admin/automatizacie")?.label, "Automatizácie");
  assert.equal(findActiveAdminNavigationItem("/admin/automatizacie-gemini")?.label, "Automatizácie Gemini");
  assert.equal(findActiveAdminNavigationItem("/admin/automatizacie-gemini")?.href, "/admin/automatizacie-gemini");
  assert.equal(getAdminBreadcrumbs("/admin/automatizacie-gemini").at(-1)?.label, "Automatizácie Gemini");
  assert.ok(source("components/admin-navigation.tsx").includes("NavigationGroups mobile"));
});

test("B: page and both API operations require existing admin protection", () => {
  const page = source("app/admin/automatizacie-gemini/page.tsx");
  const route = source("app/api/admin/gemini-automation/route.ts");
  assert.match(page, /await requireAdminPageUser\("\/admin\/automatizacie-gemini"\)/);
  assert.match(route, /if \(!await getAdminApiUser\(\)\) return unauthorizedAdminResponse\(\)/);
  assert.match(route, /await requireAdminMutation\(request\)/);
  assert.match(route, /"no-store"/);
});

test("C and D: catalog exactly mirrors three current public taxonomies, without duplicate stable keys", () => {
  assert.deepEqual(geminiAutomationSections.map((section) => section.label),
    ["Služby pre psov", "Podujatia", "Pomoc psom"]);
  assert.equal(geminiAutomationCatalog.length, directoryCategories.length + eventTypes.length + helpCategories.length);
  assert.equal(new Set(geminiAutomationCatalog.map((item) => item.stableKey)).size, geminiAutomationCatalog.length);
  assert.deepEqual(geminiAutomationCatalog.filter((item) => item.section === "directory").map((item) => item.subcategory),
    directoryCategories.map((item) => item.slug));
  assert.deepEqual(geminiAutomationCatalog.filter((item) => item.section === "events").map((item) => item.subcategory),
    eventTypes.map((item) => eventPortalCategory(item).href.split("/").at(-1)));
  assert.deepEqual(geminiAutomationCatalog.filter((item) => item.section === "help").map((item) => item.subcategory),
    helpCategories.map((item) => item.slug));
  for (const item of geminiAutomationCatalog) {
    assert.strictEqual(getGeminiCatalogItem(item.stableKey), item);
    assert.equal(item.stableKey, item.section + "." + item.subcategory);
  }
  assert.deepEqual(geminiAutomationCatalog.map((item) => item.stableKey),
    geminiAutomationCatalog.map((item) => item.stableKey));
});

test("E: missing setting uses disabled defaults; GET/list never seeds DB", async () => {
  const { sqlite, db } = fixture();
  const list = await listGeminiSettings(db);
  assert.equal(list.length, geminiAutomationCatalog.length);
  assert.ok(list.every((row) => row.enabled === false && row.saved === false
    && row.cadenceMinutes === 1440 && row.maxNewConcepts === 5 && row.nextRunAt === null));
  assert.deepEqual(await getGeminiSetting(db, geminiAutomationCatalog[0].stableKey), list[0]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_automation_settings").get().n, 0);
  sqlite.close();
});

test("F: first save inserts, second save updates same key, preserves immutable run bookkeeping", async () => {
  const { sqlite, db } = fixture();
  const input = parseGeminiSettingsInput(valid({ enabled: true }));
  const now = new Date("2026-10-08T08:00:00Z");
  const first = await saveGeminiSetting(db, input, now);
  assert.equal(first.enabled, true);
  assert.equal(first.saved, true);
  assert.equal(first.nextRunAt, "2026-10-09T08:00:00.000Z");
  const row = sqlite.prepare("SELECT id, section, subcategory, last_run_at, created_at FROM gemini_automation_settings").get();
  assert.equal(row.section, getGeminiCatalogItem(input.stableKey).section);
  assert.equal(row.subcategory, getGeminiCatalogItem(input.stableKey).subcategory);
  const second = await saveGeminiSetting(db, { ...input, enabled: false, maxNewConcepts: 0 }, now);
  assert.equal(second.enabled, false);
  assert.equal(second.maxNewConcepts, 0);
  assert.equal(second.nextRunAt, null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_automation_settings").get().n, 1);
  const after = sqlite.prepare("SELECT id, last_run_at, created_at FROM gemini_automation_settings").get();
  assert.equal(after.id, row.id);
  assert.equal(after.last_run_at, row.last_run_at);
  assert.equal(after.created_at, row.created_at);
  sqlite.close();
});

test("G and H: client cannot override canonical identifiers; strict integer bounds", () => {
  for (const extra of [{ section: "help" }, { subcategory: "falsified" }, { last_run_at: "hijack" }]) {
    assert.throws(() => parseGeminiSettingsInput(valid(extra)), GeminiSettingsValidationError);
  }
  assert.throws(() => parseGeminiSettingsInput(valid({ stable_key: "fake.category" })), GeminiSettingsValidationError);
  for (const bad of [4, 43201, -1, 0, 12.5, NaN, Infinity, "1440"]) {
    assert.throws(() => parseGeminiSettingsInput(valid({ cadence_minutes: bad })), GeminiSettingsValidationError);
  }
  for (const bad of [-1, 101, 2.5, "5", NaN]) {
    assert.throws(() => parseGeminiSettingsInput(valid({ max_new_concepts: bad })), GeminiSettingsValidationError);
  }
  assert.throws(() => parseGeminiSettingsInput(valid({ enabled: 1 })), GeminiSettingsValidationError);
  for (const cadence_minutes of [5, 43200, ...geminiCadenceOptions.map((value) => value.minutes)]) {
    assert.equal(parseGeminiSettingsInput(valid({ cadence_minutes })).cadenceMinutes, cadence_minutes);
  }
  for (const max_new_concepts of [0, 100]) {
    assert.equal(parseGeminiSettingsInput(valid({ max_new_concepts })).maxNewConcepts, max_new_concepts);
  }
});

test("I: history is stable newest-first and projects only allowlisted fields", async () => {
  const { sqlite, db } = fixture();
  await saveGeminiSetting(db, parseGeminiSettingsInput(valid()));
  const id = sqlite.prepare("SELECT id FROM gemini_automation_settings").get().id;
  const insert = sqlite.prepare(`INSERT INTO gemini_automation_runs
    (setting_id,trigger_type,status,started_at,completed_at,model,candidate_count,duplicate_count,concept_count,error_code)
    VALUES (?,'TEST','SUCCESS',?,?, 'test-model',5,2,1,NULL)`);
  insert.run(id, "2026-10-08T12:00:00Z", "2026-10-08T12:01:00Z");
  insert.run(id, "2026-10-08T12:00:00Z", "2026-10-08T12:02:00Z");
  insert.run(id, "2026-10-08T11:00:00Z", "2026-10-08T11:01:00Z");
  const runs = await listRecentGeminiRuns(db);
  assert.deepEqual(runs.map((run) => run.id), [2, 1, 3]);
  assert.deepEqual(Object.keys(runs[0]).sort(), [
    "id", "stableKey", "section", "subcategory", "startedAt", "trigger", "status", "model",
    "requestCount", "groundedSearchQueryCount", "candidateCount", "duplicateCount",
    "conceptCount", "errorCount", "completedAt", "errorCode",
  ].sort());
  assert.equal((await listRecentGeminiRuns(db, 1)).length, 1);
  assert.doesNotMatch(source("app/admin/automatizacie-gemini/page.tsx"), /raw_payload|raw_prompt|stack_trace/);
  sqlite.close();
});

test("J, K and M: settings save never performs network, Gemini runs or Notion writes", async () => {
  const { sqlite, db } = fixture();
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("Provider must not be called"); };
  try {
    const record = await saveGeminiSetting(db, parseGeminiSettingsInput(valid({ enabled: true })));
    assert.equal(record.enabled, true);
    assert.equal(calls, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_automation_runs").get().n, 0);
  } finally {
    globalThis.fetch = oldFetch;
    sqlite.close();
  }
  const store = source("lib/gemini-automation-admin-store.ts");
  assert.doesNotMatch(store, /generateContent|runGeminiAutomation|beginGeminiRun|notion|tavily|publish/i);
  assert.doesNotMatch(source("app/api/admin/gemini-automation/route.ts"), /generateContent|runGeminiAutomation|notion|tavily/i);
});

test("L: legacy automation remains untouched and runtime cron is not wired", () => {
  assert.match(source("app/admin/automatizacie/page.tsx"), /AdminShell/);
  assert.match(source("wrangler.jsonc"), /"\*\/5 \* \* \* \*"/);
  const geminiPage = source("app/admin/automatizacie-gemini/page.tsx");
  assert.doesNotMatch(geminiPage, /runDataAutomation|TavilyAutomation|runGeminiAutomation/);
});

test("scoped CI catches new Gemini admin paths without broad automation or full-core tests", () => {
  for (const path of [
    "app/admin/automatizacie-gemini/page.tsx",
    "app/api/admin/gemini-automation/route.ts",
    "components/admin-gemini-automation-settings.tsx",
    "lib/gemini-automation-admin-store.ts",
    "tests/gemini-automation-admin.test.mjs",
    "lib/admin-navigation.ts",
  ]) {
    const scope = classifyChangedFiles([path]);
    assert.ok(scope.scopes.includes("GEMINI_AUTOMATION"), path);
    assert.equal(scope.automationBroad, false, path);
    assert.equal(scope.fullCore, false, path);
  }
});
