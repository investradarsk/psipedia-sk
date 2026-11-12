import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ORGANIZATION_ADMIN_LOCATION_FACETS_SQL,
  getOrganizationAdminPage,
} from "../lib/help-organization-admin-store.ts";
import { parseOrganizationAdminFilters } from "../lib/help-organization-admin-query.ts";
import {
  ADOPTION_ADMIN_STATUS_SUMMARY_SQL,
  listAdoptionAdminDashboard,
} from "../lib/adoption-admin-store.ts";

test("three organization location filters preserve legacy DISTINCT semantics in one read", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE organization_locations (region TEXT, district TEXT, city TEXT)");
    sqlite.exec("CREATE TABLE help_organizations (region TEXT, district TEXT, city TEXT)");
    const first = sqlite.prepare("INSERT INTO organization_locations VALUES (?,?,?)");
    const second = sqlite.prepare("INSERT INTO help_organizations VALUES (?,?,?)");
    for (const row of [
      ["Nitriansky kraj", "Nitra", "Nitra"],
      ["Bratislavský kraj", "Bratislava", "Bratislava"],
      ["Nitriansky kraj", "Nitra", "Nitra"],
      ["", "", ""],
    ]) first.run(...row);
    for (const row of [
      ["Nitriansky kraj", "Nitra", "Nitra"],
      ["Trnavský kraj", "Trnava", "Trnava"],
      ["Trnavský kraj", "Trnava", "Trnava"],
      [" ", " ", " "],
    ]) second.run(...row);

    assert.doesNotMatch(ORGANIZATION_ADMIN_LOCATION_FACETS_SQL, /CROSS JOIN/,
      "facets must not multiply every source row by a dimension lookup");
    assert.equal((ORGANIZATION_ADMIN_LOCATION_FACETS_SQL.match(/UNION ALL/g) ?? []).length, 2,
      "three legacy DISTINCT dimension reads share exactly one SQL request");
    const newRows = sqlite.prepare(ORGANIZATION_ADMIN_LOCATION_FACETS_SQL).all();
    for (const column of ["region", "district", "city"]) {
      const legacy = sqlite.prepare(`SELECT value FROM (
        SELECT trim(${column}) AS value FROM organization_locations WHERE trim(${column}) <> ''
        UNION
        SELECT trim(${column}) AS value FROM help_organizations WHERE trim(${column}) <> ''
      ) ORDER BY value COLLATE NOCASE ASC`).all().map(item => item.value);
      assert.deepEqual(newRows.filter(row => row.kind === column).map(row => row.value), legacy, column);
    }
    const plan = sqlite.prepare("EXPLAIN QUERY PLAN " + ORGANIZATION_ADMIN_LOCATION_FACETS_SQL).all();
    assert.ok(plan.some(row => /organization_locations/.test(row.detail)));
    assert.ok(plan.some(row => /help_organizations/.test(row.detail)));
  } finally {
    sqlite.close();
  }
});

function organizationDb({ total = 123, filtered = 11, holdTotals = null } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) { call.bindings = bindings; return this; },
        async first() {
          if (sql.includes("COUNT(*) AS total")) {
            if (holdTotals) await holdTotals;
            return { total, draft: 5, published: total - 5, archived: 0 };
          }
          if (sql.includes("COUNT(*) AS count")) return { count: filtered };
          throw Error("Unexpected first(): " + sql);
        },
        async all() {
          if (sql === ORGANIZATION_ADMIN_LOCATION_FACETS_SQL) return { results: [
            { kind: "city", value: "Nitra" },
            { kind: "district", value: "Nitra" },
            { kind: "region", value: "Nitriansky kraj" },
          ] };
          if (sql.includes("ORDER BY") && sql.includes("LIMIT ? OFFSET ?")) return { results: [] };
          throw Error("Unexpected all(): " + sql);
        },
      };
    },
  };
  return { db, calls };
}

test("organizations request the bounded page during a blocked D1 summary, without extra unfiltered COUNT", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { db, calls } = organizationDb({ holdTotals: gate });
  const filters = parseOrganizationAdminFilters({ get: key => key === "page" ? "2" : null });
  const work = getOrganizationAdminPage(filters, db);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(call => /SELECT COUNT\(\*\) AS total/.test(call.sql)).length, 1);
    assert.equal(calls.filter(call => /SELECT COUNT\(\*\) AS count/.test(call.sql)).length, 0);
    assert.equal(calls.filter(call => call.sql === ORGANIZATION_ADMIN_LOCATION_FACETS_SQL).length, 1);
    assert.equal(calls.filter(call => /LIMIT \? OFFSET \?/.test(call.sql)).length, 1, "page started before summary returns");
  } finally {
    release();
  }
  const result = await work;
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.total, 123);
  assert.deepEqual(result.options.cities, ["Nitra"]);
  assert.equal(calls.length, 3);
});

test("filtered organizations clamp out-of-range pages and keep exact matched count", async () => {
  const { db, calls } = organizationDb({ total: 123, filtered: 11 });
  const filters = parseOrganizationAdminFilters({ get: key =>
    key === "page" ? "999" : key === "q" ? "Nitra" : null,
  });
  const page = await getOrganizationAdminPage(filters, db);
  assert.equal(page.pagination.page, 1);
  assert.equal(page.pagination.total, 11);
  assert.equal(page.pagination.totalPages, 1);
  assert.equal(page.counts.total, 123);
  assert.equal(calls.filter(call => /LIMIT \? OFFSET \?/.test(call.sql)).length, 2);
  const reads = calls.filter(call => /LIMIT \? OFFSET \?/.test(call.sql));
  assert.equal(reads[0].bindings.at(-1), 998 * 50);
  assert.equal(reads[1].bindings.at(-1), 0);
});

test("adoption lifecycle and stale summary exactly match independent legacy counts", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE adoption_dogs (status TEXT, last_verified_at TEXT)");
    const insert = sqlite.prepare("INSERT INTO adoption_dogs VALUES (?,?)");
    for (const row of [
      ["ACTIVE", null], ["ACTIVE", "2026-09-01T00:00:00.000Z"],
      ["ACTIVE", "2026-11-01T00:00:00.000Z"], ["RESERVED", "2026-08-01T00:00:00.000Z"],
      ["DRAFT", null], ["ARCHIVED", null], ["ADOPTED", null],
    ]) insert.run(...row);
    const threshold = "2026-10-01T00:00:00.000Z";
    const grouped = sqlite.prepare(ADOPTION_ADMIN_STATUS_SUMMARY_SQL).all(threshold);
    const staleCount = grouped.reduce((n, row) => n + Number(row.staleCount), 0);
    const legacy = sqlite.prepare("SELECT COUNT(*) AS count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)").get(threshold).count;
    assert.equal(staleCount, legacy);
    assert.deepEqual(grouped.map(r => [r.status, r.count]).sort(),
      sqlite.prepare("SELECT status, COUNT(*) AS count FROM adoption_dogs GROUP BY status").all().map(r => [r.status, r.count]).sort());
  } finally {
    sqlite.close();
  }
});

test("adoption page and grouped counts start before the delayed filtered-count response", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(sql);
      return {
        bind() { return this; },
        async first() { await gate; return { count: 8 }; },
        async all() {
          if (sql.includes("GROUP BY status")) return { results: [
            { status: "ACTIVE", count: 6, staleCount: 2 },
            { status: "RESERVED", count: 2, staleCount: 1 },
          ] };
          return { results: [] };
        },
      };
    },
  };
  const work = listAdoptionAdminDashboard({ page: 1 }, db, new Date("2026-11-12T07:00:00.000Z"));
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(sql => sql.includes("GROUP BY status")).length, 1);
    assert.equal(calls.filter(sql => sql.includes("LIMIT ? OFFSET ?")).length, 1);
  } finally {
    release();
  }
  const result = await work;
  assert.equal(result.counts.total, 8);
  assert.equal(result.counts.stale, 3);
  assert.equal(result.pagination.total, 8);
});

test("lost-found lookup starts schema-compatible projection and filtered count together", () => {
  const source = readFileSync(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function listAdminDogReports(");
  const end = source.indexOf("export async function getAdminDogReport(", start);
  const list = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(list, /const \[count, projection\] = await Promise\.all\(\[/);
  assert.match(list, /selectWithOptionalShortDescription\(database, adminSelect\)/);
  assert.match(list, /SELECT \$\{projection\} FROM lost_found_dog_reports/);
  assert.match(list, /LIMIT \? OFFSET \?/);
  assert.doesNotMatch(list, /SELECT \$\{await selectWithOptionalShortDescription\(database, adminSelect\)\}/);
});

test("existing organization and adoption indexes are preserved without a new migration", () => {
  const schema = [
    "drizzle/0034_adoption_dogs_foundation.sql",
    "drizzle/0040_organization_locations_foundation.sql",
    "drizzle/0041_organization_fundraising_methods.sql",
  ].map(file => readFileSync(new URL("../" + file, import.meta.url), "utf8")).join("\n");
  for (const name of [
    "adoption_dogs_verified_idx", "adoption_dogs_admin_updated_idx",
    "organization_locations_org_order_idx", "organization_fundraising_methods_org_order_idx",
  ]) assert.ok(schema.includes(name), name);
});
