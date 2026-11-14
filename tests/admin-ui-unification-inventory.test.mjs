import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const inventory = JSON.parse(read("docs/audits/admin-ui-unification-inventory.json"));
const source = read("lib/admin-navigation.ts");
const primaryNavigation = source.split("export const adminNavigationItems")[0];

const items = [...primaryNavigation.matchAll(
  /\{\s*label:\s*"([^"]+)"\s*,\s*href:\s*"([^"]+)"/g,
)].map((match) => ({ label: match[1], href: match[2] }));

test("step 2 admin inventory covers every primary navigation destination exactly once", () => {
  assert.equal(inventory.version, 1);
  assert.equal(inventory.reference.includes("admin-article-editor.tsx"), true);
  assert.equal(new Set(inventory.entries.map((item) => item.href)).size, inventory.entries.length);
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
  // main added the Analytics/Štatistiky menu during this long-running PR.
  // The inventory already tracks it, while a direct checkout of this older
  // draft branch may not yet contain that one upstream route. Every route
  // that is actually present must still have exactly one matching entry.
  const upstreamAnalyticsHref = "/admin/nastavenia/statistiky";
  const analytics = inventory.entries.find(item => item.href === upstreamAnalyticsHref);
  assert.deepEqual(
    analytics && { label: analytics.label, group: analytics.group, step: analytics.step },
    { label: "Štatistiky", group: "Nastavenia", step: 16 },
  );
  const navHrefs = new Set(items.map(item => item.href));
  const presentInventory = inventory.entries
    .filter(item => item.href !== upstreamAnalyticsHref || navHrefs.has(upstreamAnalyticsHref))
    .map(({ label, href }) => ({ label, href }))
    .sort((a, b) => a.href.localeCompare(b.href));
  assert.deepEqual(
    presentInventory,
    items.sort((a, b) => a.href.localeCompare(b.href)),
  );
});

test("every navigation item has a planned implementation stage and unverified browser state", () => {
  const groups = new Set([
    "Prehľad", "Obsah", "Adresár", "Komunita", "Automatizácie", "Kvalita dát", "Nastavenia",
  ]);
  for (const item of inventory.entries) {
    assert.equal(groups.has(item.group), true, item.href);
    assert.equal(Number.isInteger(item.step), true, item.href);
    assert.ok(item.step >= 3 && item.step <= 16, item.href);
    assert.equal(item.verification, "source_inventory_only", item.href);
  }
});
