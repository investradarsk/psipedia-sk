import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { findActiveAdminNavigationItem } from "../lib/admin-navigation.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const inventory = JSON.parse(read("docs/audits/admin-ui-unification-inventory.json"));

test("step 18: complete admin navigation inventory has seven groups and all expected modules", () => {
  assert.equal(inventory.entries.length, 28, "27 active destinations plus upstream analytics after retiring public proposals");
  assert.deepEqual([...new Set(inventory.entries.map(item => item.group))], [
    "Prehľad", "Obsah", "Adresár", "Komunita",
    "Automatizácie", "Kvalita dát", "Nastavenia",
  ]);
  assert.equal(new Set(inventory.entries.map(item => item.href)).size, 28);
  const currentNav = read("lib/admin-navigation.ts");
  for (const item of inventory.entries) {
    assert.ok(findActiveAdminNavigationItem(item.href), item.href);
    assert.ok(currentNav.includes(`"${item.href}"`), item.href);
    assert.equal(item.verification, "source_inventory_only", item.href);
  }
});

test("step 18: admin-only CSS foundation and opt-in presentation scopes remain imported", () => {
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /<div data-admin-workspace>/);
  for (const file of [
    "admin-editorial-foundation.css",
    "admin-list-foundation.css",
    "admin-community-step13.css",
    "admin-operations-step15.css",
    "admin-settings-step16.css",
  ]) {
    assert.ok(layout.includes('import "./' + file + '";'), file);
    const css = read("app/admin/" + file);
    assert.ok(css.includes("[data-admin-workspace]"), file);
  }
  const foundation = read("app/admin/admin-editorial-foundation.css");
  assert.match(foundation, /--admin-ui-font-family: ui-sans-serif, system-ui/);
  assert.match(foundation, /--admin-ui-control-height: 44px/);
  const article = read("components/admin-editor-workspace.module.css");
  assert.match(article, /--admin-ui-font-family/);
});

test("step 18: new global admin skins do not conceal horizontal document overflow", () => {
  for (const file of [
    "app/admin/admin-community-step13.css",
    "app/admin/admin-operations-step15.css",
    "app/admin/admin-settings-step16.css",
  ]) {
    const css = read(file);
    assert.doesNotMatch(css, /(?:^|\n)\s*(?:html|body|:root)\s*\{/m, file);
    assert.doesNotMatch(css, /overflow-x:\s*hidden/, file);
    assert.match(css, /min-width:\s*0/, file);
  }
});

test("step 18: responsive E2E coverage is present but does not claim to have executed", () => {
  for (const file of [
    "tests/e2e/admin-mobile-stability-step7.spec.ts",
    "tests/e2e/admin-community-step13.spec.ts",
    "tests/e2e/admin-operations-step15.spec.ts",
    "tests/e2e/admin-settings-step16.spec.ts",
  ]) {
    const spec = read(file);
    assert.match(spec, /localhost|127\.0\.0\.1/, file);
    for (const width of [320, 390, 1440]) assert.ok(spec.includes(String(width)), file + " " + width);
    assert.match(spec, /document\.documentElement\.scrollWidth/, file);
  }
  const finalReport = read("docs/audits/admin-ui-unification-step18.md");
  assert.match(finalReport, /CI.*nepotvrdené/i);
  assert.match(finalReport, /Safari/);
  assert.match(finalReport, /mergeable=false/);
});

test("step 18: critical admin handlers remain in their respective owners", () => {
  assert.match(read("components/admin-article-editor.tsx"), /AdminEditorWorkspace|AdminTiptapArticleEditor|AdminArticleEditor/);
  assert.match(read("components/admin-missing-quality-dashboard.tsx"), />Aktuálny údaj</);
  assert.match(read("components/admin-missing-quality-dashboard.tsx"), />Nájdený údaj</);
  assert.match(read("components/admin-geo-operator-dashboard.tsx"), /data-google-bulk-cost-notice/);
  assert.match(read("components/admin-navigation-editor.tsx"), /<AdminDestructiveConfirmDialog/);
  assert.match(read("components/admin-monetization-dashboard.tsx"), /method: "PATCH"/);
  assert.match(read("components/admin-legal-settings.tsx"), /method: "PUT"/);
  assert.ok(!existsSync(new URL("../components/admin-deferred-details.tsx", import.meta.url)));
});
