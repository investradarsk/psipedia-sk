import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseAdminEventListQuery, buildAdminEventPageSql } from "../lib/admin-event-pagination.ts";
import { parseOrganizationAdminFilters, organizationAdminHref } from "../lib/help-organization-admin-query.ts";
import { parseHelpAdminFilters } from "../lib/help-admin-query.ts";
import { buildAdoptionAdminListQuery } from "../lib/adoption-admin-store.ts";

const code = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("event server query handles globally sorted title, city, updated and dates with whitelisted direction", () => {
  const parsed = parseAdminEventListQuery(new URLSearchParams("sort=title&direction=desc&page=2"));
  assert.equal(parsed.filters.sort, "title");
  assert.equal(parsed.filters.direction, "desc");
  assert.match(buildAdminEventPageSql(parsed, "2026-11-11").order, /DESC/);
  assert.match(buildAdminEventPageSql(parseAdminEventListQuery(new URLSearchParams("sort=city&direction=asc")), "2026-11-11").order, /city/i);
  const invalid = parseAdminEventListQuery(new URLSearchParams("sort=DROP&direction=DROP"));
  assert.equal(invalid.filters.sort, "date");
  assert.equal(invalid.filters.direction, "asc");
  assert.match(buildAdminEventPageSql(invalid, "2026-11-11").order, /CASE WHEN cancelled/);
});

test("organization sort and direction survive the canonical filter URL", () => {
  const parsed = parseOrganizationAdminFilters(new URLSearchParams("type=CIVIC_ASSOCIATION&status=DRAFT&sort=name&direction=asc&page=3"));
  assert.equal(parsed.sort, "name");
  assert.equal(parsed.direction, "asc");
  assert.equal(parsed.page, 3);
  const href = organizationAdminHref(parsed);
  assert.match(href, /sort=name/);
  assert.match(href, /direction=asc/);
  assert.match(href, /status=DRAFT/);
  assert.match(code("lib/help-organization-admin-store.ts"), /ORDER BY \\$\\{sortSql\\} \\$\\{directionSql\\}, o\\.id/);
  const invalid = parseOrganizationAdminFilters(new URLSearchParams("sort=DROP&direction=DROP"));
  assert.equal(invalid.sort, "updated");
  assert.equal(invalid.direction, "desc");
});

test("adoption name sorting has both directions before pagination", () => {
  assert.equal(buildAdoptionAdminListQuery({ sort: "name-asc" }).orderBy, "name COLLATE NOCASE ASC, id ASC");
  assert.equal(buildAdoptionAdminListQuery({ sort: "name-desc" }).orderBy, "name COLLATE NOCASE DESC, id DESC");
  assert.equal(buildAdoptionAdminListQuery({ sort: "verified-asc" }).orderBy, "last_verified_at ASC, updated_at ASC, id ASC");
  assert.equal(buildAdoptionAdminListQuery({ sort: "invalid" }).orderBy, "updated_at DESC, id DESC");
});

test("Help sort whitelist survives filters without changing domain boundaries", () => {
  const parsed = parseHelpAdminFilters(new URLSearchParams("category=zbierky&sort=title&direction=asc"));
  assert.equal(parsed.category, "zbierky");
  assert.equal(parsed.sort, "title");
  assert.equal(parsed.direction, "asc");
  assert.equal(parseHelpAdminFilters(new URLSearchParams("sort=DROP&direction=DROP")).sort, undefined);
  assert.match(code("lib/help-admin-query.ts"), /ORDER BY \\$\\{sortColumn\\} \\$\\{sortDirection\\}, id/);
});

test("lost-found sorting remains a readonly whitelisted SQL projection", () => {
  const source = code("lib/lost-found-dog-store.ts");
  const ui = code("components/admin-lost-found-dashboard.tsx");
  assert.match(source, /const sortExpressions: Record<string, string>/);
  assert.match(source, /sortExpressions\\[sortKey\\]/);
  assert.match(source, /ORDER BY \\$\\{orderSql\\} LIMIT/);
  assert.match(ui, /<AdminRecordTable/);
  assert.match(ui, /serverSorting=\\{\\{/);
  assert.match(ui, /rowDataAttribute="data-admin-lost-found-row"/);
});

test("all canonical step 3 grids use compact shared table and preserve old module mutation ownership", () => {
  for (const name of [
    "admin-event-dashboard", "admin-help-dashboard", "admin-help-unified-table",
    "admin-organization-publication-dashboard", "admin-adoption-dashboard",
    "admin-lost-found-dashboard"
  ]) {
    const source = code("components/" + name + ".tsx");
    assert.match(source, /<AdminRecordTable/, name);
  }
  const shared = code("components/admin-record-table.tsx");
  assert.doesNotMatch(shared, /fetch\\(|method: "DELETE"|method: "PATCH"/);
  assert.match(code("components/admin-adoption-dashboard.tsx"), /className=\\{styles\\.adoptionCards\\}/);
});
