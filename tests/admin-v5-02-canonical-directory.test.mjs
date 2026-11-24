import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminDetailHref, adminReturnHref } from "../lib/admin-return-navigation.ts";
import { directoryAdminHref, parseDirectoryAdminFilters } from "../lib/directory-admin-query.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const categories = new Set(["veterinari", "treneri", "chovatelske-stanice"]);
const parse = query => parseDirectoryAdminFilters(new URLSearchParams(query), value => categories.has(value));

test("V5-02: old list keeps safe GET URLs but does not load another D1 list", () => {
  const legacy = read("app/admin/sluzby-pre-psov/page.tsx");
  const canonical = read("app/admin/adresar/page.tsx");
  const catalog = read("app/admin/sluzby-pre-psov/katalog/page.tsx");
  assert.match(legacy, /parseDirectoryAdminFilters\(/);
  assert.match(legacy, /redirect\(directoryAdminHref\(filters\)\)/);
  assert.doesNotMatch(legacy, /getManagedDirectoryAdminPage|AdminDirectoryDashboard|AdminShell/);
  assert.match(canonical, /getManagedDirectoryAdminPage\(filters\)/);
  assert.match(catalog, /AdminServiceCatalogWorkspace/);
  const filters = parse("category=veterinari&status=draft&q=klinika&region=Nitriansky+kraj&page=3&sort=name&direction=desc");
  const target = new URL(directoryAdminHref(filters), "https://admin.invalid");
  assert.equal(target.pathname, "/admin/adresar");
  for (const [key, expected] of Object.entries({
    category: "veterinari", status: "draft", q: "klinika", region: "Nitriansky kraj",
    page: "3", sort: "name", direction: "desc",
  })) assert.equal(target.searchParams.get(key), expected, key);
  assert.equal(directoryAdminHref(parse("category=bogus&status=unknown&page=-3&invalid=1")), "/admin/adresar");
});

test("V5-02: category links retain membership, sorting and search while resetting page", () => {
  const nav = read("components/admin-directory-module-nav.tsx");
  assert.match(nav, /href: "\/admin\/adresar"/);
  assert.match(nav, /allDirectoryCategories\.map/);
  assert.match(nav, /categoryHref\(category.slug\)/);
  assert.match(nav, /directoryAdminHref\(\{ \.\.\.filters, category, page: 1 \}\)/);
  assert.match(nav, /href="\/admin\/sluzby-pre-psov\/katalog"/);
  const filters = parse("category=veterinari&status=published&q=Žilina&district=Žilina&verification=verified&media=with-image&sort=city&direction=desc&page=9");
  const next = new URL(directoryAdminHref({ ...filters, category: "treneri", page: 1 }), "https://admin.invalid");
  const prior = new URL(directoryAdminHref(filters), "https://admin.invalid");
  assert.equal(next.pathname, "/admin/adresar");
  assert.equal(next.searchParams.get("category"), "treneri");
  assert.equal(next.searchParams.get("page"), null);
  for (const key of ["status", "q", "district", "verification", "media", "sort", "direction"]) {
    assert.equal(next.searchParams.get(key), prior.searchParams.get(key), key);
  }
  assert.equal(new URL(directoryAdminHref({ ...filters, category: "", page: 1 }), "https://admin.invalid").searchParams.has("category"), false);
});

test("V5-02: pagination and editor returnTo preserve the filtered canonical URL", () => {
  const ui = read("components/admin-directory-dashboard.tsx");
  assert.match(ui, /action="\/admin\/adresar" method="get"/);
  assert.match(ui, /const listReturnHref = directoryAdminHref\(\{ \.\.\.filters, page: pagination.page \}\)/);
  assert.match(ui, /<AdminPagination pagination=\{pagination\} basePath=\{directoryAdminHref\(\{ \.\.\.filters, page: 1 \}\)\}/);
  assert.match(ui, /<AdminDirectoryEditorLink[^>]*returnHref=\{listReturnHref\}/);
  assert.doesNotMatch(ui, /basePath\?:|replace\("\/admin\/adresar", basePath\)/);
  const filters = parse("category=veterinari&q=klinika&status=draft&sort=name&page=2");
  const second = directoryAdminHref(filters);
  const third = new URL(directoryAdminHref({ ...filters, page: 3 }), "https://admin.invalid");
  assert.equal(third.searchParams.get("page"), "3");
  assert.equal(third.searchParams.get("q"), "klinika");
  assert.equal(directoryAdminHref({ ...filters, page: 1 }).includes("page="), false);
  const detail = adminDetailHref("/admin/adresar/42", second);
  assert.equal(new URL(detail, "https://admin.invalid").searchParams.get("returnTo"), second);
  assert.equal(adminReturnHref(second, ["/admin/adresar", "/admin/sluzby-pre-psov"]), second);
  assert.equal(adminReturnHref("/admin/sluzby-pre-psov?category=veterinari&page=2",
    ["/admin/adresar", "/admin/sluzby-pre-psov"]), "/admin/sluzby-pre-psov?category=veterinari&page=2");
});
