import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminFilteredListHref, adminNumberedPageWindow } from "../lib/admin-list-query.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("the seven-page numeric window matches both original GET dashboards for every page", () => {
  for (let pages = 1; pages <= 100; pages++) {
    for (let current = 1; current <= pages; current++) {
      const expected = Array.from({ length: Math.min(pages, 7) }, (_, index) => {
        const start = Math.max(1, Math.min(current - 3, pages - 6));
        return start + index;
      }).filter((page) => page <= pages);
      assert.deepEqual(adminNumberedPageWindow(current, pages), expected, `page ${current}/${pages}`);
    }
  }
  assert.deepEqual(adminNumberedPageWindow(1, 0), []);
  assert.deepEqual(adminNumberedPageWindow(0, 5), [1,2,3,4,5]);
});

test("shared GET filter href preserves exact order, defaults and encoded text", () => {
  assert.equal(adminFilteredListHref("/admin/adopcie", [], 1), "/admin/adopcie");
  assert.equal(adminFilteredListHref("/admin/stratene-najdene", [["q", "Rex & Max"], ["status", "ACTIVE"], ["locality", "Nové Zámky"]], 3),
    "/admin/stratene-najdene?q=Rex+%26+Max&status=ACTIVE&locality=Nov%C3%A9+Z%C3%A1mky&page=3");
  assert.equal(adminFilteredListHref("/admin/adopcie", [["freshness", ""], ["sort", null], ["status", undefined], ["q", "pes"]], 1),
    "/admin/adopcie?q=pes");
  assert.equal(adminFilteredListHref("/admin/adopcie", [["q", ""], ["status", "ACTIVE"]], 2),
    "/admin/adopcie?status=ACTIVE&page=2");
});

test("adoptions and lost/found share URL, numeric pagination and table shell without changing GET filters", () => {
  const adoption = read("components/admin-adoption-dashboard.tsx");
  const lost = read("components/admin-lost-found-dashboard.tsx");
  const pagination = read("components/admin-pagination.tsx");
  const table = read("components/admin-data-table-region.tsx");
  for (const src of [adoption, lost]) {
    assert.match(src, /adminFilteredListHref\(/);
    assert.match(src, /<AdminNumberedPagination/);
    assert.match(src, /<AdminDataTableRegion/);
    assert.match(src, /method="get"/);
    assert.doesNotMatch(src, /Array\.from\(\{length:Math\.min\(result\./);
    assert.match(src, /<table className=\{styles.table\}>/);
  }
  assert.match(adoption, /hrefForPage=\{\(page\)=>adminHref\(filters,\{page\}\)\}/);
  assert.match(adoption, /\["sort", next\.sort && next\.sort !== "updated-desc" \? next\.sort : ""\]/);
  assert.match(adoption, /\["freshness", next\.freshness && next\.freshness !== "all" \? next\.freshness : ""\]/);
  assert.match(lost, /hrefForPage=\{\(page\)=>href\(filters,page\)\}/);
  assert.match(lost, /\["status", status\]/);
  assert.match(pagination, /aria-current="page"/);
  assert.match(pagination, /adminNumberedPageWindow\(page, totalPages\)/);
  assert.match(table, /role="region" aria-label=\{label\} tabIndex=\{0\}/);
});

test("event and Help use existing indeterminate checkbox without changing explicit selection scope", () => {
  const help = read("components/admin-help-dashboard.tsx");
  const event = read("components/admin-event-dashboard.tsx");
  const shared = read("components/admin-bulk-selection.tsx");
  assert.match(shared, /ref\.current\.indeterminate = indeterminate/);
  assert.match(shared, /onChange\(event\.currentTarget\.checked\)/);
  for (const src of [help, event]) {
    assert.match(src, /<BulkSelectionCheckbox/);
    assert.match(src, /indeterminate=\{pageSomeSelected\}/);
    assert.match(src, /const \[selected, setSelected\] = useState<Set<number>>\(new Set\(\)\)/);
    assert.doesNotMatch(src, /useAdminBulkSelection\(/);
  }
  assert.match(help, /onChange=\{togglePage\}/);
  assert.match(help, /mode: "ids" as const, ids: \[\.\.\.selected\]/);
  assert.match(help, /confirmedCount: preview\.items\.length/);
  assert.match(event, /rows\.forEach\(\(row\) =>/);
  assert.match(event, /selected\.size > 500/);
  assert.match(event, /selectionPayload\(targets\)/);
  assert.match(event, /setSelected\(new Set\(\)\)/);
});

test("event stays client-filtered while GET list forms keep their query parameters", () => {
  const event = read("components/admin-event-dashboard.tsx");
  const adoption = read("components/admin-adoption-dashboard.tsx");
  const lost = read("components/admin-lost-found-dashboard.tsx");
  assert.match(event, /setFilters\(\(current\) => \(\{ \.\.\.current, \[key\]: value \}\)\)/);
  assert.match(event, /setPage\(1\)/);
  assert.match(event, /fetchAdminEventPage\(filters, page/);
  assert.match(adoption, /\["status", next\.status\]/);
  assert.match(lost, /\["type", filters\.type\]/);
});
