import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { searchAdminRecords } from "../lib/admin-global-search.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE directory_profiles (id INTEGER, name TEXT, city TEXT, category TEXT, updated_at TEXT);
    CREATE TABLE managed_events (id INTEGER, title TEXT, city TEXT, venue TEXT, start_date TEXT);
    CREATE TABLE adoption_dogs (id INTEGER, name TEXT, city TEXT, breed_name TEXT, organization_name TEXT, updated_at TEXT);
    CREATE TABLE lost_found_dog_reports (id INTEGER, dog_name TEXT, city TEXT, search_text TEXT, updated_at TEXT);
    CREATE TABLE help_cases (id INTEGER, title TEXT, category TEXT, city TEXT, organization TEXT, updated_at TEXT);
    CREATE TABLE help_organizations (id INTEGER, name TEXT, city TEXT, updated_at TEXT);
    CREATE TABLE managed_articles (id INTEGER, title TEXT, category TEXT, excerpt TEXT, updated_at TEXT);
    CREATE TABLE managed_breeds (id INTEGER, name TEXT, official_fci_name TEXT, updated_at TEXT);
    INSERT INTO directory_profiles VALUES (7, 'Labrador veterinár', 'Nitra', 'veterinari', '2026');
    INSERT INTO managed_events VALUES (7, 'Labrador seminár', 'Nitra', 'Klub', '2026');
    INSERT INTO adoption_dogs VALUES (7, 'Labrador na adopciu', 'Nitra', '', '', '2026');
    INSERT INTO lost_found_dog_reports VALUES (7, 'Labrador stratený', 'Nitra', '', '2026');
    INSERT INTO help_cases VALUES (7, 'Labrador zbierka', 'zbierka', 'Nitra', '', '2026');
    INSERT INTO help_organizations VALUES (7, 'Labrador pomoc', 'Nitra', '2026');
    INSERT INTO managed_articles VALUES (7, 'Labrador tipy', 'Zdravie', '', '2026');
    INSERT INTO managed_breeds VALUES (7, 'Labrador retriever', 'Labrador Retriever', '2026');
  `);
  let batches = 0;
  let singles = 0;
  const db = {
    prepare(sql) {
      assert.match(sql, /^SELECT /);
      let values = [];
      return {
        bind(...params) {
          values = params;
          assert.ok(values.length > 0);
          assert.ok(values.every(value => value === "labrador"));
          return this;
        },
        async all() {
          singles += 1;
          return { success: true, results: sqlite.prepare(sql).all(...values) };
        },
      };
    },
    async batch(statements) {
      batches += 1;
      return Promise.all(statements.map(statement => statement.all()));
    },
  };
  return { db, sqlite, metrics: () => ({ batches, singles }) };
}

test("global search batches eight real SQL searches in one D1 request", async () => {
  const { db, sqlite, metrics } = fixture();
  try {
    const found = await searchAdminRecords(db, "labrador");
    assert.equal(found.incomplete, false);
    assert.equal(found.results.length, 8);
    assert.deepEqual(new Set(found.results.map(row => row.category)), new Set([
      "Služby pre psov", "Podujatia", "Adopcie", "Stratené a nájdené",
      "Pomoc psom", "Organizácie", "Články", "Plemená",
    ]));
    assert.ok(found.results.every(row => row.href.includes("/admin/")));
    assert.equal(metrics().batches, 1);
    assert.equal(metrics().singles, 8, "all eight statements were issued within one batch call");

    const short = await searchAdminRecords(db, "l");
    assert.deepEqual(short.results, []);
    assert.equal(metrics().batches, 1, "short input never hits D1");
  } finally {
    sqlite.close();
  }
});

test("failed batch falls back to isolated reads without hiding healthy modules", async () => {
  const { db, sqlite, metrics } = fixture();
  const originalPrepare = db.prepare.bind(db);
  const brokenDb = {
    ...db,
    async batch() { throw new Error("one schema is migrating"); },
    prepare(sql) {
      const statement = originalPrepare(sql);
      if (!sql.includes("FROM managed_events")) return statement;
      const all = statement.all.bind(statement);
      return {
        bind(...args) { statement.bind(...args); return this; },
        async all() { await all(); throw new Error("missing events schema"); },
      };
    },
  };
  try {
    const found = await searchAdminRecords(brokenDb, "labrador");
    assert.equal(found.incomplete, true);
    assert.equal(found.results.length, 7);
    assert.ok(!found.results.some(row => row.category === "Podujatia"));
    assert.equal(metrics().singles, 8);
  } finally {
    sqlite.close();
  }
});

test("global search UI debounces, aborts stale responses and reuses a short-lived bounded cache", () => {
  const ui = readFileSync(new URL("../components/admin-quick-navigation-dialog.tsx", import.meta.url), "utf8");
  assert.match(ui, /SEARCH_DEBOUNCE_MS = 140/);
  assert.match(ui, /SEARCH_CACHE_TTL_MS = 15_000/);
  assert.match(ui, /SEARCH_CACHE_LIMIT = 24/);
  assert.match(ui, /const cache = useRef\(new Map/);
  assert.match(ui, /cached\.expiresAt > Date\.now\(\)/);
  assert.match(ui, /controller\.abort\(\)/);
  assert.match(ui, /controller\.signal\.aborted/);
  assert.match(ui, /cache: "no-store"/);
});

test("tombstoned profile instantly disappears from global Admin search", async () => {
  const {db,sqlite} = fixture();
  try {
    sqlite.exec("CREATE TABLE admin_record_tombstones (kind TEXT,record_id INTEGER)");
    sqlite.exec("INSERT INTO admin_record_tombstones VALUES ('directory',7)");
    const result = await searchAdminRecords(db, "labrador", true);
    assert.equal(result.incomplete,false);
    assert.equal(result.results.length,7);
    assert.ok(!result.results.some(row=>row.category==="Služby pre psov"));
    assert.ok(result.results.some(row=>row.category==="Podujatia"),
      "other records with the same numeric ID must remain visible");
  }finally { sqlite.close(); }
});
