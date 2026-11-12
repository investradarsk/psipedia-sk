/**
 * Read-only local SQLite query-plan experiment. No production D1 connection.
 * Contrasts the *existing* substring predicate and the exact Admin-ID fastpath.
 * Example: npm run benchmark:admin-search-v2
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";

export const searchSql = `
  SELECT id, name FROM directory_profiles
  WHERE instr(lower(coalesce(name, '')), lower(?)) > 0
  ORDER BY updated_at DESC LIMIT 6
`;
export const exactIdSql = `
  SELECT id, name FROM directory_profiles WHERE id = ? LIMIT 6
`;

const db = new DatabaseSync(":memory:");
const COUNT = 20_000;
function timings(statement, argument, repeats = 45) {
  for (let i = 0; i < 5; i++) statement.all(argument);
  const samples = [];
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    statement.all(argument);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    p50Ms: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(3)),
    count: samples.length,
  };
}

try {
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("CREATE INDEX idx_admin_v2_fixture_updated_at ON directory_profiles(updated_at DESC)");
  const insert = db.prepare("INSERT INTO directory_profiles (id,name,updated_at) VALUES (?,?,?)");
  db.exec("BEGIN");
  try {
    for (let i = 1; i <= COUNT; i++) {
      insert.run(i, i % 23 === 0 ? "Veterina test " + i : "Iny profil " + i,
        "2026-11-" + String((i % 28) + 1).padStart(2, "0"));
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }

  const substring = db.prepare(searchSql);
  const exact = db.prepare(exactIdSql);
  assert.deepEqual(exact.all(46).map(row => row.id), [46]);
  assert.equal(substring.all("veterina").length, 6);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, COUNT);
  const results = {
    kind: "in-memory-synthetic-sqlite-not-cloudflare-d1",
    rows: COUNT,
    queryPlans: {
      substring: db.prepare("EXPLAIN QUERY PLAN " + searchSql).all("veterina").map(row => row.detail),
      exactId: db.prepare("EXPLAIN QUERY PLAN " + exactIdSql).all(46).map(row => row.detail),
    },
    execution: {
      substring: timings(substring, "veterina"),
      exactId: timings(exact, 46),
    },
    limitations: "SQLite fixture only; no D1 rows_read, network, browser INP, production data or FTS schema change.",
  };
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
} finally {
  db.close();
}
