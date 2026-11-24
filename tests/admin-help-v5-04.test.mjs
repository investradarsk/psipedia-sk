import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminDetailHref, adminReturnHref } from "../lib/admin-return-navigation.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5-04 has four Help tabs and no duplicate mobile navigation", () => {
  const page = read("app/admin/pomoc-psom/page.tsx");
  const grid = read("components/admin-help-unified-table.tsx");
  const css = read("components/admin-help-unified-table.module.css");
  assert.deepEqual(
    [...page.slice(page.indexOf("const workspaceCategories"), page.indexOf("const organizationFilters"))
      .matchAll(/\{ slug: "(adopcia|stratene-a-najdene|organizacie|ostatna-pomoc)", label:/g)]
      .map(match => match[1]),
    ["adopcia", "stratene-a-najdene", "organizacie", "ostatna-pomoc"],
  );
  assert.match(grid, /aria-label="Typ pomoci"/);
  assert.match(grid, /aria-label="Podkategórie Pomoci psom"/);
  assert.match(grid, /item\.slug === activeScope/);
  assert.doesNotMatch(page, /AdminSectionHub|AdminDirectoryModuleNav|mobileHub/);
  assert.doesNotMatch(css, /\.workspace\s*\{\s*display:\s*none/);
  assert.match(css, /\.workspace \{ display: grid; max-width: 100%; \}/);
  assert.match(grid, /<AdminRecordTable/);
});

test("V5-04 supports all organizations, legacy subcategories, and Help bulk isolation", () => {
  const page = read("app/admin/pomoc-psom/page.tsx");
  const grid = read("components/admin-help-unified-table.tsx");
  assert.match(page, /allHelpCategories\.some\(item => item\.slug === requested\)/);
  assert.match(page, /category === "utulky" \|\| category === "organizacie"/);
  assert.match(page, /category === "utulky" \? "SHELTER" : null/);
  assert.match(page, /category === "ostatna-pomoc" \? null : category/);
  assert.match(page, /category: item\.category, status: item\.resolved/);
  assert.match(grid, /isHelpAdminCreateCategory\(category\)/);
  assert.match(grid, /expectedCategory: category/);
  assert.match(grid, /const viewKey = JSON\.stringify\(\[category, query, page, rows\.map/);
});

test("V5-04 retains correct detail routes and round-trip query plus pagination", () => {
  const page = read("app/admin/pomoc-psom/page.tsx");
  const grid = read("components/admin-help-unified-table.tsx");
  for (const path of ["/admin/adopcie/", "/admin/stratene-najdene/", "/admin/organizacie/", "/admin/pomoc/"]) {
    assert.ok(page.includes('href: "' + path + '" + item.id'), path);
  }
  assert.match(page, /returnQuery\.set\("q", q\)/);
  assert.match(page, /returnQuery\.set\("page", String\(table\.page\)\)/);
  assert.match(page, /adminDetailHref\(row\.href, returnHref\)/);
  assert.match(grid, /if \(nextQuery\) params\.set\("q", nextQuery\)/);
  assert.match(grid, /if \(nextPage > 1\) params\.set\("page", String\(nextPage\)\)/);
  assert.match(grid, /key=\{category \+ ":" \+ query\}/);
  for (const [category, root] of [
    ["adopcia", "/admin/adopcie"], ["stratene-a-najdene", "/admin/stratene-najdene"],
    ["organizacie", "/admin/organizacie"], ["ostatna-pomoc", "/admin/pomoc"],
  ]) {
    const listing = "/admin/pomoc-psom?category=" + category + "&q=pes&page=3";
    const detail = new URL(adminDetailHref(root + "/27", listing), "https://admin.invalid");
    assert.equal(adminReturnHref(detail.searchParams.get("returnTo") ?? undefined,
      [root, "/admin/pomoc-psom"]), listing);
  }
  assert.match(grid, /stickyActions/);
});

test("V5-04 shared table never receives a private contact field", () => {
  const page = read("app/admin/pomoc-psom/page.tsx");
  const grid = read("components/admin-help-unified-table.tsx");
  assert.doesNotMatch(page, /privateEmail:|privatePhone:|contactEmail:|contactPhone:/);
  assert.doesNotMatch(grid, /privateEmail|privatePhone|contactEmail|contactPhone/);
  assert.match(page, /publicEmail: item\.publicEmail/);
  assert.match(page, /publicPhone: item\.publicPhone/);
});
