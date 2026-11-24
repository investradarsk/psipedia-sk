import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminNavigationItems, findActiveAdminNavigationItem } from "../lib/admin-navigation.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const inventory = JSON.parse(read("docs/audits/admin-ui-unification-inventory.json"));
const source = read("lib/admin-navigation.ts");
const primaryNavigation = source.split("export const adminNavigationItems")[0];

const items = [...primaryNavigation.matchAll(
  /\{\s*label:\s*"([^"]+)"\s*,\s*href:\s*"([^"]+)"/g,
)].map((match) => ({ label: match[1], href: match[2] }));

test("historical Admin inventory remains traceable through canonical links or legacy aliases", () => {
  assert.equal(inventory.version, 1);
  assert.equal(inventory.entries.length, 28);
  assert.equal(new Set(inventory.entries.map(item => item.href)).size, inventory.entries.length);
  assert.equal(new Set(items.map(item => item.href)).size, items.length);
  // This inventory is a pre-V5 snapshot. Removing a duplicate sidebar link
  // must not remove the old URL or its mapped canonical workspace.
  for (const old of inventory.entries) {
    assert.ok(adminNavigationItems.some(item => item.href === old.href || item.matches?.includes(old.href)), old.href);
    assert.ok(findActiveAdminNavigationItem(old.href), old.href);
  }
});

test("historical inventory retains its audit provenance and stage metadata", () => {
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
