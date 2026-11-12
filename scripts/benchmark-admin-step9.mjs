/**
 * Read-only local SQLite microbenchmark. Never connects to Cloudflare D1.
 * SQL is imported from the current code to avoid benchmarking stale copies.
 * Usage: npm run benchmark:admin-step9
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { ORGANIZATION_ADMIN_LOCATION_FACETS_SQL } from "../lib/help-organization-admin-store.ts";
import { ADOPTION_ADMIN_STATUS_SUMMARY_SQL } from "../lib/adoption-admin-store.ts";

const FIXTURE_ORGANIZATIONS = 1000;
const FIXTURE_LOCATIONS = 3000;
const FIXTURE_ADOPTIONS = 3000;
const RUNS = 45;
const threshold = "2026-10-01T00:00:00.000Z";

function summary(samples) {
  const ordered = [...samples].sort((a, b) => a - b);
  const sum = ordered.reduce((total, value) => total + value, 0);
  return {
    samples: ordered.length,
    meanMs: Number((sum / ordered.length).toFixed(3)),
    p50Ms: Number(ordered[Math.floor(ordered.length * 0.50)].toFixed(3)),
    p95Ms: Number(ordered[Math.floor(ordered.length * 0.95)].toFixed(3)),
  };
}
function benchmark(operation) {
  for (let n = 0; n < 5; n++) operation(); // warm up the SQLite query cache
  const times = [];
  for (let n = 0; n < RUNS; n++) {
    const start = performance.now();
    operation();
    times.push(performance.now() - start);
  }
  return summary(times);
}
const db = new DatabaseSync(":memory:");
try {
  db.exec(`
    CREATE TABLE organization_locations (region TEXT, district TEXT, city TEXT);
    CREATE TABLE help_organizations (region TEXT, district TEXT, city TEXT);
    CREATE TABLE adoption_dogs (status TEXT, last_verified_at TEXT);
    CREATE INDEX idx_adoption_status_verified ON adoption_dogs(status, last_verified_at);
  `);
  const insertOrg = db.prepare("INSERT INTO help_organizations VALUES (?,?,?)");
  const insertLocation = db.prepare("INSERT INTO organization_locations VALUES (?,?,?)");
  const insertAdoption = db.prepare("INSERT INTO adoption_dogs VALUES (?,?)");
  db.exec("BEGIN");
  try {
    for (let i = 0; i < FIXTURE_ORGANIZATIONS; i++) insertOrg.run(
      "Kraj " + (i % 14), "Okres " + (i % 70), "Mesto " + (i % 220),
    );
    for (let i = 0; i < FIXTURE_LOCATIONS; i++) insertLocation.run(
      "Kraj " + (i % 14), "Okres " + (i % 70), "Mesto " + (i % 220),
    );
    const statuses = ["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"];
    for (let i = 0; i < FIXTURE_ADOPTIONS; i++) insertAdoption.run(
      statuses[i % statuses.length], i % 4 === 0 ? null : i % 3 === 0
        ? "2026-09-01T00:00:00.000Z" : "2026-11-01T00:00:00.000Z",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const facetKinds = ["region", "district", "city"];
  const legacyFacetQueries = Object.fromEntries(facetKinds.map(kind => [kind, db.prepare(`
    SELECT value FROM (
      SELECT trim(${kind}) AS value FROM organization_locations WHERE trim(${kind}) <> ''
      UNION
      SELECT trim(${kind}) AS value FROM help_organizations WHERE trim(${kind}) <> ''
    ) ORDER BY value COLLATE NOCASE ASC
  `)]));
  const newFacetQuery = db.prepare(ORGANIZATION_ADMIN_LOCATION_FACETS_SQL);
  const oldFacetRead = () => Object.fromEntries(facetKinds.map(kind => [
    kind, legacyFacetQueries[kind].all().map(row => row.value),
  ]));
  const newFacetRead = () => {
    const result = newFacetQuery.all();
    return Object.fromEntries(facetKinds.map(kind => [
      kind, result.filter(row => row.kind === kind).map(row => row.value),
    ]));
  };
  assert.deepEqual(newFacetRead(), oldFacetRead(), "facet values and ordering must be identical");

  const oldLifecycle = db.prepare("SELECT status, COUNT(*) AS count FROM adoption_dogs GROUP BY status");
  const oldStale = db.prepare(
    "SELECT COUNT(*) AS count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)",
  );
  const newLifecycle = db.prepare(ADOPTION_ADMIN_STATUS_SUMMARY_SQL);
  const oldAdoptionRead = () => ({
    counts: oldLifecycle.all().map(row => [row.status, row.count]).sort(),
    stale: oldStale.get(threshold).count,
  });
  const newAdoptionRead = () => {
    const grouped = newLifecycle.all(threshold);
    return {
      counts: grouped.map(row => [row.status, row.count]).sort(),
      stale: grouped.reduce((total, row) => total + Number(row.staleCount), 0),
    };
  };
  assert.deepEqual(newAdoptionRead(), oldAdoptionRead(), "adoption totals and stale count must agree");

  const result = {
    kind: "synthetic-local-sqlite-not-production-d1",
    fixtureRows: {
      organizations: FIXTURE_ORGANIZATIONS,
      locations: FIXTURE_LOCATIONS,
      adoptions: FIXTURE_ADOPTIONS,
    },
    facetReads: { previousSqlStatements: 3, currentSqlStatements: 1,
      previous: benchmark(oldFacetRead), current: benchmark(newFacetRead) },
    adoptionSummary: { previousSqlStatements: 2, currentSqlStatements: 1,
      previous: benchmark(oldAdoptionRead), current: benchmark(newAdoptionRead) },
    notes: "Latency is local CPU/SQLite only. No D1 network, mobile browser, production data or live p95 timings.",
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally {
  db.close();
}
