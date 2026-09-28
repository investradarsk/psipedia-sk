import assert from "node:assert/strict";
import test from "node:test";
import {
  articleAdminListHref,
  buildArticleAdminListQuery,
  parseArticleAdminListFilters,
} from "../lib/article-admin-query.ts";
import {
  adminContainsNeedle,
  boundedAdminPage,
  boundedAdminPageSize,
  normalizeAdminSearch,
} from "../lib/admin-list-query.ts";

function params(values = {}) {
  return { get: (name) => values[name] ?? null };
}

test("article admin params are bounded and invalid values fail closed", () => {
  const parsed = parseArticleAdminListFilters(params({
    query: "  zuby  ",
    status: "invalid",
    section: "invalid",
    sort: "sql",
    direction: "sideways",
    page: "-4",
    pageSize: "9999",
  }));
  assert.equal(parsed.query, "zuby");
  assert.equal(parsed.status, "all");
  assert.equal(parsed.portalSection, "all");
  assert.equal(parsed.sort, "updated");
  assert.equal(parsed.direction, "desc");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 100);
  assert.equal(boundedAdminPage("2"), 2);
  assert.equal(boundedAdminPageSize("0"), 50);
});

test("article search is accent-insensitive and escapes wildcard control characters", () => {
  assert.equal(normalizeAdminSearch("  ŽÚBY ŠTENIATKA  "), "zuby steniatka");
  assert.equal(adminContainsNeedle("100%_pes\\test"), "%100\\%\\_pes\\\\test%");
  const query = buildArticleAdminListQuery({
    query: "Žuby",
    status: "published",
    portalSection: "all",
    sort: "title",
    direction: "asc",
    page: 2,
    pageSize: 50,
  }, "clanky");
  assert.match(query.where, /portal_section = \?/);
  assert.match(query.where, /status = \?/);
  assert.match(query.where, /LIKE \? ESCAPE/);
  assert.deepEqual(query.bindings.slice(0, 2), ["clanky", "published"]);
  assert.equal(query.bindings.at(-1), "%zuby%");
  assert.equal(query.orderBy, "title COLLATE NOCASE ASC, id ASC");
  assert.equal(query.offset, 50);
});

test("article admin URL persists filter and pagination state", () => {
  const href = articleAdminListHref("/admin", {
    query: "zuby psa",
    status: "draft",
    portalSection: "clanky",
    sort: "title",
    direction: "asc",
    page: 2,
    pageSize: 50,
  });
  assert.equal(href, "/admin?query=zuby+psa&status=draft&section=clanky&sort=title&direction=asc&page=2");
});

test("article search query contract stays server-side and deterministic", () => {
  const query = buildArticleAdminListQuery({
    query: "",
    status: "all",
    portalSection: "all",
    sort: "updated",
    direction: "desc",
    page: 1,
    pageSize: 50,
  });
  assert.equal(query.where, "");
  assert.equal(query.orderBy, "updated_at DESC, id DESC");
  assert.equal(query.offset, 0);
});
