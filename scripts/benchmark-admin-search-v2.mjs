/**
 * Deterministic, read-only-to-production Admin search query-plan experiment.
 * Execute the actual eight category SELECTs used by searchAdminRecords against
 * synthetic in-memory SQLite. No production Cloudflare D1 binding is touched.
 * Run: node --experimental-strip-types scripts/benchmark-admin-search-v2.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { searchAdminRecords } from "../lib/admin-global-search.ts";

export const FIXTURE_ROWS_PER_CATEGORY = 1_500;
const SEARCH_TEXT = "labrador";
const EXACT_ID = 42;

// The schema matches ONLY the columns read by the global search. The synthetic
// primary keys model the normal SQLite/D1 id index; these are not migrations.
const fixtures = [
  { table: "directory_profiles", columns: ["name","city","category","updated_at"],
    values: i => [label(i), city(i), "veterinari", date(i)] },
  { table: "managed_events", columns: ["title","city","venue","start_date"],
    values: i => [label(i), city(i), "Kynologický klub", date(i)] },
  { table: "adoption_dogs", columns: ["name","city","breed_name","organization_name","updated_at"],
    values: i => [label(i), city(i), "Labrador", "Občianske združenie", date(i)] },
  { table: "lost_found_dog_reports", columns: ["dog_name","city","search_text","updated_at"],
    values: i => [label(i), city(i), "Hľadáme psa", date(i)] },
  { table: "help_cases", columns: ["title","category","city","organization","updated_at"],
    values: i => [label(i), "zbierka", city(i), "Pomoc zvieratám", date(i)] },
  { table: "help_organizations", columns: ["name","city","updated_at"],
    values: i => [label(i), city(i), date(i)] },
  { table: "managed_articles", columns: ["title","category","excerpt","updated_at"],
    values: i => [label(i), "Výcvik", "Odborný článok", date(i)] },
  { table: "managed_breeds", columns: ["name","official_fci_name","updated_at"],
    values: i => [label(i), "FCI názov", date(i)] },
];
function label(i) { return i % 37 === 0 ? "Labrador záznam " + i : "Kontrolný záznam " + i; }
function city(i) { return i % 13 === 0 ? "Nitra" : "Trnava"; }
function date(i) { return "2026-11-" + String((i % 28) + 1).padStart(2, "0"); }

export function syntheticAdminSearchDatabase(rowsPerCategory = FIXTURE_ROWS_PER_CATEGORY) {
  const sqlite = new DatabaseSync(":memory:");
  for (const fixture of fixtures) {
    sqlite.exec("CREATE TABLE " + fixture.table + " (id INTEGER PRIMARY KEY, " +
      fixture.columns.map(column => column + " TEXT").join(", ") + ")");
  }
  sqlite.exec("CREATE TABLE admin_record_tombstones (kind TEXT NOT NULL, record_id INTEGER NOT NULL, PRIMARY KEY (kind,record_id))");
  // Synthetic fixture writes only in memory, never to any production datastore.
  sqlite.exec("BEGIN");
  try {
    for (const fixture of fixtures) {
      const insert = sqlite.prepare("INSERT INTO " + fixture.table + " (id," +
        fixture.columns.join(",") + ") VALUES (" +
        ["?", ...fixture.columns.map(() => "?")].join(",") + ")");
      for (let id = 1; id <= rowsPerCategory; id++) insert.run(id, ...fixture.values(id));
    }
    sqlite.prepare("INSERT INTO admin_record_tombstones (kind,record_id) VALUES (?,?)").run("directory", EXACT_ID);
    sqlite.exec("COMMIT");
  } catch (error) { sqlite.exec("ROLLBACK"); sqlite.close(); throw error; }

  const queries = [];
  let batchCalls = 0;
  const database = {
    prepare(sql) {
      const entry = { sql, params: [] };
      queries.push(entry);
      return {
        bind(...params) { entry.params = params; return this; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...entry.params) }; },
      };
    },
    async batch(statements) {
      batchCalls += 1;
      return Promise.all(statements.map(statement => statement.all()));
    },
  };
  return { sqlite, database, queries, getBatchCalls: () => batchCalls };
}

function onePlan(sqlite, query) {
  const tableMatch = query.sql.match(/\bFROM\s+(directory_profiles|managed_events|adoption_dogs|lost_found_dog_reports|help_cases|help_organizations|managed_articles|managed_breeds)\b/);
  assert.ok(tableMatch, "Benchmark must only inspect approved Admin search tables");
  const plan = sqlite.prepare("EXPLAIN QUERY PLAN " + query.sql).all(...query.params).map(row => String(row.detail));
  const isFullScan = plan.some(line => /\bSCAN\s+(?:TABLE\s+)?(?:`?\w+`?\.)?`?\w+`?/i.test(line));
  const hasIndexedLookup = plan.some(line => /\bSEARCH\s+/i.test(line) && /(?:PRIMARY KEY|INDEX|ROWID)/i.test(line));
  return { table: tableMatch[1], sqlPlan: plan, hasScanStep: isFullScan, hasIndexedLookup };
}

function milliseconds(sqlite, queries, repetitions = 10) {
  const prepared = queries.map(entry => ({ statement: sqlite.prepare(entry.sql), args: entry.params }));
  const run = () => {
    let rows = 0;
    for (const { statement, args } of prepared) rows += statement.all(...args).length;
    return rows;
  };
  for (let i = 0; i < 2; i++) run();
  const samples = [];
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    queries: queries.length,
    repetitions,
    p50Ms: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    p95Ms: Number(samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))].toFixed(3)),
  };
}

export async function benchmarkAdminSearchV2(rowsPerCategory = FIXTURE_ROWS_PER_CATEGORY) {
  const fixture = syntheticAdminSearchDatabase(rowsPerCategory);
  try {
    const runs = {};
    for (const [label, input, excludeRemovals] of [
      ["substring", SEARCH_TEXT, false],
      ["exactId", String(EXACT_ID), false],
      ["tombstonedExactId", "#" + EXACT_ID, true],
    ]) {
      fixture.queries.length = 0;
      const result = await searchAdminRecords(fixture.database, input, excludeRemovals);
      const snapshot = fixture.queries.map(({ sql, params }) => ({ sql, params: [...params] }));
      assert.equal(result.incomplete, false);
      assert.equal(snapshot.length, fixtures.length, "The real search must issue eight category queries");
      assert.deepEqual(new Set(snapshot.map(entry => onePlan(fixture.sqlite, entry).table)),
        new Set(fixtures.map(entry => entry.table)));
      if (label === "substring") {
        assert.ok(result.results.some(item => item.title.toLowerCase().includes(SEARCH_TEXT)));
      } else if (label === "exactId") {
        assert.equal(result.results.length, 8);
      } else {
        assert.equal(result.results.length, 7);
        assert.ok(!result.results.some(item => item.category === "Služby pre psov"));
      }
      runs[label] = {
        resultCount: result.results.length,
        allTables: snapshot.map(query => onePlan(fixture.sqlite, query)),
        localTiming: milliseconds(fixture.sqlite, snapshot),
      };
    }
    assert.equal(fixture.getBatchCalls(), 3, "Real search still batches every category");
    return {
      kind: "in-memory-synthetic-sqlite-not-cloudflare-d1",
      rowsPerCategory,
      totalSyntheticRows: rowsPerCategory * fixtures.length,
      checkedCategories: fixtures.length,
      batchCalls: fixture.getBatchCalls(),
      cases: runs,
      limitations: [
        "Plans and p50/p95 timings are synthetic SQLite on this CI machine, not Cloudflare D1 query costs.",
        "SQLite substring search and FTS5 token matching do not have identical semantics.",
        "No production rows_read, application TTFB, browser INP, or real iPhone memory measured.",
        "No production SQL, schema, indexes, authorization, tombstones, or Notion data modified.",
      ],
    };
  } finally { fixture.sqlite.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await benchmarkAdminSearchV2();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
