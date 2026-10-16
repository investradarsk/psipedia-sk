import test from "node:test";
import assert from "node:assert/strict";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import {
  geminiImportAgenda, parseGeminiCreatedPages, registerGeminiCreatedPages,
  expectedGeminiNotionSource, verifyGeminiCreatedPages,
} from "../lib/gemini-notion-provenance.ts";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS } from "../scripts/production-d1-migrate.mjs";

const ID = "a1111111-1111-4111-8111-111111111111";
const ID2 = "b2222222-2222-4222-8222-222222222222";
const SOURCES = {
  directory: "d1111111-1111-4111-8111-111111111111",
  events: "e1111111-1111-4111-8111-111111111111",
  organizations: "01111111-1111-4111-8111-111111111111",
  adoptions: "a2222222-2222-4222-8222-222222222222",
  "help-cases": "c1111111-1111-4111-8111-111111111111",
  "lost-found": "f1111111-1111-4111-8111-111111111111",
};
const ENV = {
  NOTION_DIRECTORY_DATA_SOURCE_ID: SOURCES.directory,
  NOTION_EVENTS_DATA_SOURCE_ID: SOURCES.events,
  NOTION_ORGANIZATIONS_DATA_SOURCE_ID: SOURCES.organizations,
  NOTION_ADOPTIONS_DATA_SOURCE_ID: SOURCES.adoptions,
  NOTION_HELP_DATA_SOURCE_ID: SOURCES["help-cases"],
  NOTION_LOST_FOUND_DATA_SOURCE_ID: SOURCES["lost-found"],
};
const receipt = (stableKey, pageId=ID) => ({
  notion_page_id: pageId, stable_key: stableKey,
  notion_data_source_id: expectedGeminiNotionSource(ENV, geminiImportAgenda(stableKey)),
});

test("all 22 registered categories map to exactly one canonical D1 agenda", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  const byAgenda = new Map();
  for (const { stableKey } of geminiAutomationCatalog) {
    const agenda = geminiImportAgenda(stableKey);
    assert.ok(agenda, stableKey);
    byAgenda.set(agenda, (byAgenda.get(agenda) ?? 0) + 1);
    const parsed = parseGeminiCreatedPages([receipt(stableKey)], stableKey, 1, ENV);
    assert.equal(parsed?.agenda, agenda, stableKey);
    assert.equal(parsed?.pages.length, 1);
    assert.equal(parsed?.pages[0].notion_page_id, ID);
    assert.deepEqual(parseGeminiCreatedPages([], stableKey, 0, {}), { pages: [], agenda });
  }
  assert.equal(byAgenda.get("directory"), 10);
  assert.equal(byAgenda.get("events"), 6);
  assert.equal([...byAgenda.entries()].filter(([agenda]) => !["directory","events"].includes(agenda))
    .reduce((sum, [, n]) => sum + n, 0), 6);
});
test("signature is necessary but never bypasses job/category/target/UUID checks", () => {
  const key = "help.stratene-a-najdene";
  assert.equal(parseGeminiCreatedPages([receipt(key)], "events.vystavy", 1, ENV), null);
  assert.equal(parseGeminiCreatedPages([{ ...receipt(key), stable_key: "help.adopcia" }], key, 1, ENV), null);
  assert.equal(parseGeminiCreatedPages([{ ...receipt(key), notion_data_source_id: SOURCES.events }], key, 1, ENV), null);
  assert.equal(parseGeminiCreatedPages([{ ...receipt(key), notion_page_id: "PRIVATE CONTACT" }], key, 1, ENV), null);
  assert.equal(parseGeminiCreatedPages([receipt(key), receipt(key)], key, 2, ENV), null);
  assert.equal(parseGeminiCreatedPages([receipt(key)], key, 2, ENV), null);
  assert.equal(parseGeminiCreatedPages([receipt(key), receipt(key, ID2)], key, 2, ENV)?.pages.length, 2);
  assert.equal(parseGeminiCreatedPages([receipt(key)], key, 1, {}), null);
  assert.equal(parseGeminiCreatedPages([{ ...receipt(key), extra: "raw model text" }], key, 1, ENV), null);
});

function fakeRegistry() {
  const rows = new Map();
  return { rows, db: {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async run() {
          if (!sql.includes("INSERT INTO gemini_notion_created_pages")) throw Error("Unexpected SQL");
          if (!rows.has(args[0])) rows.set(args[0], {
            job_id: args[1], stable_key: args[2], notion_data_source_id: args[3],
            import_agenda: args[4],
          });
          return { meta: { changes: 1 } };
        },
        async first() {
          if (!sql.includes("FROM gemini_notion_created_pages")) throw Error("Unexpected SQL");
          return rows.get(args[0]) ?? null;
        },
      };
      return stmt;
    },
  }};
}
test("registration is idempotent, and another job cannot claim an already registered page", async () => {
  const { rows, db } = fakeRegistry();
  const parsed = parseGeminiCreatedPages([receipt("help.adopcia")], "help.adopcia", 1, ENV);
  await registerGeminiCreatedPages(db, 23, parsed);
  await registerGeminiCreatedPages(db, 23, parsed);
  assert.equal(rows.size, 1);
  await assert.rejects(() => registerGeminiCreatedPages(db, 24, parsed), /GEMINI_PROVENANCE_COLLISION/);
});
test("offline source contracts require registry and enforce private-only canonical writes", () => {
  const d = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const h = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const a = readFileSync(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(d, /gemini_notion_created_pages/);
  assert.match(d, /if \(trustedGemini\)/);
  assert.match(d, /status: "draft"/);
  assert.match(h, /gemini_notion_created_pages/);
  assert.match(h, /trustedGemini/);
  assert.match(h, /GEMINI_PROVENANCE_IMPORT_CONFLICT/);
  assert.match(a, /forceDraft \? "DRAFT"/);
  assert.match(a, /"Latitude": null, "Longitude": null/);
  assert.match(a, /GEMINI_PUBLICATION_REQUIRES_CANONICAL_EDITOR/);
  assert.match(worker, /created_pages: pageIds\.map/);
});
test("0127 receipt identity remains unique and the applied rollout stays guarded", async () => {
  const sql = readFileSync(new URL("../drizzle/0127_gemini_notion_created_pages.sql", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../scripts/production-d1-migrate.mjs", import.meta.url), "utf8");
  assert.match(sql, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(sql, /REFERENCES gemini_manual_background_jobs\(id\)/);
  assert.match(sql, /UNIQUE \(import_agenda, canonical_entity_id\)/);
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes("0127_gemini_notion_created_pages.sql"));
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, ["0130_facebook_image_publisher.sql"]);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.includes("0128_facebook_image_posts.sql"), true);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.includes("0129_gemini_external_manual_queue.sql"), true);
  assert.match(runner, /export const APPROVED_0128_SHA256 = "[a-f0-9]{64}"/);
  assert.match(runner, /export function assertApproved0128Target/);
  assert.match(runner, /export function assert0128NotAlreadyApplied/);
  assert.match(runner, /invariant\(!targetApplied, "0128 already applied; refusing repeated production APPLY"\)/);
  assert.match(runner, /"0127_gemini_notion_created_pages\.sql",/);
  assert.match(runner, /export const APPROVED_0127_SHA256 = "[a-f0-9]{64}"/);
  assert.match(runner, /export function assertApproved0127Target/);
  assert.match(runner, /export function assert0127NotAlreadyApplied/);
  assert.match(runner, /invariant\(!targetApplied, "0127 already applied; refusing repeated production APPLY"\)/);
});


test("provider read-back verifies immutable Notion page and canonical source before registry insert", async () => {
  const key = "directory.veterinari";
  const pages = parseGeminiCreatedPages([receipt(key)], key, 1, ENV).pages;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({
      id: ID, parent: { type: "data_source_id", data_source_id: SOURCES.directory },
      archived: false, in_trash: false, properties: {},
    });
    await verifyGeminiCreatedPages({ NOTION_API_TOKEN: "offline" }, pages);
    globalThis.fetch = async () => Response.json({
      id: ID, parent: { type: "data_source_id", data_source_id: SOURCES.events },
      archived: false, in_trash: false, properties: {},
    });
    await assert.rejects(() => verifyGeminiCreatedPages({ NOTION_API_TOKEN: "offline" }, pages),
      /GEMINI_PROVENANCE_PAGE_MISMATCH/);
    globalThis.fetch = async () => Response.json({
      id: ID, parent: { type: "data_source_id", data_source_id: SOURCES.directory },
      archived: true, properties: {},
    });
    await assert.rejects(() => verifyGeminiCreatedPages({ NOTION_API_TOKEN: "offline" }, pages),
      /GEMINI_PROVENANCE_PAGE_MISMATCH/);
  } finally { globalThis.fetch = original; }
});


function sqliteProvenanceRegistry() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE gemini_manual_background_jobs (id INTEGER PRIMARY KEY);");
  sqlite.exec("INSERT INTO gemini_manual_background_jobs(id) VALUES(23),(24)");
  // Test the exact additive production 0127 migration on a real in-memory SQLite.
  sqlite.exec(readFileSync(new URL("../drizzle/0127_gemini_notion_created_pages.sql", import.meta.url), "utf8"));
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...args) { return {
      async run() { return statement.run(...args); },
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args) }; },
    }; } };
  } };
  return { sqlite, db };
}

test("0127 real SQLite records durable receipts for all 22 categories, idempotent replay and foreign-page exclusion", async () => {
  const { sqlite, db } = sqliteProvenanceRegistry();
  const priorFetch = globalThis.fetch;
  const seen = new Map();
  try {
    for (const [index, entry] of geminiAutomationCatalog.entries()) {
      const key = entry.stableKey;
      const pageId = "c3333333-3333-4333-8333-" + String(index + 1).padStart(12, "0");
      const parsed = parseGeminiCreatedPages([receipt(key, pageId)], key, 1, ENV);
      assert.ok(parsed, key);
      // Actual production page-verification helper reads an isolated, mocked
      // Notion response before any registry write, not candidate-supplied text.
      globalThis.fetch = async () => Response.json({
        id: pageId,
        parent: { type: "data_source_id", data_source_id: parsed.pages[0].notion_data_source_id },
        archived: false, in_trash: false,
      });
      await verifyGeminiCreatedPages({ NOTION_API_TOKEN: "offline-only" }, parsed.pages);
      await registerGeminiCreatedPages(db, 23, parsed);
      await registerGeminiCreatedPages(db, 23, parsed);
      seen.set(key, pageId);
    }
    assert.equal(seen.size, 22);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_notion_created_pages").get().n, 22);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_notion_created_pages WHERE canonical_entity_id IS NOT NULL").get().n, 0);
    for (const [key, pageId] of seen) {
      const row = sqlite.prepare("SELECT * FROM gemini_notion_created_pages WHERE notion_page_id=?").get(pageId);
      assert.equal(row.stable_key, key);
      assert.equal(row.import_agenda, geminiImportAgenda(key));
      assert.equal(row.imported_at, null);
      assert.equal(row.canonical_entity_id, null);
    }
    const first = geminiAutomationCatalog[0].stableKey;
    await assert.rejects(
      () => registerGeminiCreatedPages(db, 24, parseGeminiCreatedPages([receipt(first, seen.get(first))], first, 1, ENV)),
      /GEMINI_PROVENANCE_COLLISION/,
    );
    const any = seen.get(geminiAutomationCatalog[2].stableKey);
    globalThis.fetch = async () => Response.json({
      id: any, parent: { type: "data_source_id", data_source_id: SOURCES.events },
    });
    await assert.rejects(
      () => verifyGeminiCreatedPages({ NOTION_API_TOKEN: "offline-only" },
        parseGeminiCreatedPages([receipt(geminiAutomationCatalog[2].stableKey, any)],
          geminiAutomationCatalog[2].stableKey, 1, ENV).pages),
      /GEMINI_PROVENANCE_PAGE_MISMATCH/,
    );
    assert.throws(() => sqlite.exec(
      "INSERT INTO gemini_notion_created_pages(notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) " +
      "VALUES('d4444444-4444-4444-8444-444444444444',999,'events.vystavy','" +
        SOURCES.events + "','events')"),
      /FOREIGN KEY/,
    );
  } finally { globalThis.fetch = priorFetch; sqlite.close(); }
});

test("0127 SQL prevents two page IDs from claiming one canonical entity; rollback preserves identity", () => {
  const { sqlite } = sqliteProvenanceRegistry();
  try {
    const a = receipt("directory.salony-a-sluzby", ID);
    const b = receipt("directory.salony-a-sluzby", ID2);
    const add = sqlite.prepare("INSERT INTO gemini_notion_created_pages" +
      "(notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) VALUES(?,?,?,?,?)");
    add.run(a.notion_page_id, 23, a.stable_key, a.notion_data_source_id, "directory");
    add.run(b.notion_page_id, 23, b.stable_key, b.notion_data_source_id, "directory");
    const mark = sqlite.prepare("UPDATE gemini_notion_created_pages SET canonical_entity_id=?,imported_at=? " +
      "WHERE notion_page_id=? AND canonical_entity_id IS NULL");
    assert.equal(mark.run(717, "2026-10-15T00:00:00Z", ID).changes, 1);
    assert.equal(mark.run(717, "2026-10-15T00:00:00Z", ID).changes, 0,
      "replayed mapped import cannot silently reassign");
    assert.throws(() => mark.run(717, "2026-10-15T00:00:00Z", ID2), /UNIQUE constraint failed/);
    assert.equal(sqlite.prepare("SELECT canonical_entity_id FROM gemini_notion_created_pages WHERE notion_page_id=?").get(ID2).canonical_entity_id, null);
    assert.throws(() => sqlite.exec("UPDATE gemini_notion_created_pages SET canonical_entity_id=717,imported_at=NULL WHERE notion_page_id='" + ID2 + "'"), /CHECK constraint failed/);
  } finally { sqlite.close(); }
});
