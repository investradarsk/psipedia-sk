import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { benchmarkAdminSearchV2, syntheticAdminSearchDatabase } from "../scripts/benchmark-admin-search-v2.mjs";
import { searchAdminRecords } from "../lib/admin-global-search.ts";

test("5/10 real global-search SQL is planned on eight synthetic category schemas", async () => {
  const data = await benchmarkAdminSearchV2(150);
  assert.equal(data.kind, "in-memory-synthetic-sqlite-not-cloudflare-d1");
  assert.equal(data.checkedCategories, 8);
  assert.equal(data.totalSyntheticRows, 1200);
  assert.equal(data.batchCalls, 3);
  assert.equal(data.cases.exactId.resultCount, 8);
  assert.equal(data.cases.tombstonedExactId.resultCount, 7);
  for (const [name, value] of Object.entries(data.cases)) {
    assert.equal(value.allTables.length, 8, name);
    assert.equal(value.localTiming.queries, 8, name);
    assert.ok(value.allTables.every(item => item.sqlPlan.length > 0), name);
    assert.ok(Number.isFinite(value.localTiming.p50Ms), name);
    assert.ok(Number.isFinite(value.localTiming.p95Ms), name);
  }
  assert.ok(data.cases.exactId.allTables.every(item => item.hasIndexedLookup),
    "all eight exact-id lookups must use synthetic INTEGER PRIMARY KEY");
  assert.ok(data.limitations.some(item => item.includes("not Cloudflare D1")));
});

test("synthetic fixture preserves the text results and tombstone suppression from real SQL", async () => {
  const fixture = syntheticAdminSearchDatabase(150);
  try {
    const textual = await searchAdminRecords(fixture.database, "labrador");
    assert.equal(textual.incomplete, false);
    assert.ok(textual.results.some(row => row.category === "Plemená"));
    assert.ok(textual.results.some(row => row.category === "Adopcie"));
    const id = await searchAdminRecords(fixture.database, "#42");
    assert.equal(id.results.length, 8);
    const filtered = await searchAdminRecords(fixture.database, "#42", true);
    assert.equal(filtered.results.length, 7);
    assert.equal(filtered.results.some(row => row.category === "Služby pre psov"), false);
    assert.ok(filtered.results.some(row => row.category === "Podujatia"));
  } finally {
    fixture.sqlite.close();
  }
});

test("search diagnostics never depend on a production binding or mutation endpoint", () => {
  const source = readFileSync(new URL("../scripts/benchmark-admin-search-v2.mjs", import.meta.url), "utf8");
  assert.match(source, /new DatabaseSync\(":memory:"\)/);
  assert.match(source, /import \{ searchAdminRecords \} from "..\/lib\/admin-global-search.ts"/);
  assert.match(source, /EXPLAIN QUERY PLAN/);
  assert.doesNotMatch(source, /cloudflare:workers|wrangler|\bfetch\s*\(|process\.env\.|https?:\/\//);
});
