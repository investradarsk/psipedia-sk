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
  assert.deepEqual(
    inventory.entries.map(({ label, href }) => ({ label, href })).sort((a, b) => a.href.localeCompare(b.href)),
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
