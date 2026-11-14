import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 15: quality review retains current-versus-found values and manual approval", () => {
  const src = read("components/admin-missing-quality-dashboard.tsx");
  const css = read("components/admin-missing-quality-dashboard.module.css");

  assert.match(src, /data-admin-content-module="quality-review"/);
  assert.match(src, />Aktuálny údaj</);
  assert.match(src, />Nájdený údaj</);
  assert.match(src, /p\.current_value\?\?"Prázdny"/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /onClick=\{\(\)=>void decide\(p,"accept"\)\}/);
  assert.match(src, /onClick=\{\(\)=>void decide\(p,"reject"\)\}/);
  assert.match(src, /manualRequest/);
  assert.match(css, /ADMIN VISUAL 15\/18/);
  assert.match(css, /\.manualControls :is\(input, select\)/);
});

test("step 15: geo operator preserves paid-action warnings, explicit actions and local filters", () => {
  const src = read("components/admin-geo-operator-dashboard.tsx");
  const css = read("app/admin/admin-operations-step15.css");

  assert.match(src, /data-admin-content-module="geo-operator"/);
  assert.match(src, /className="admin-field-grid" data-admin-list-filters/);
  assert.match(src, /data-admin-list-pagination/);
  assert.match(src, /data-google-bulk-cost-notice/);
  assert.match(src, /onClick=\{\(\) => void runBulk\(\)\}/);
  assert.match(src, /<AdminGooglePlacePicker/);
  assert.match(src, /onClick=\{\(\) => void markNotRequired\(item\)\}/);
  assert.match(css, /\[data-admin-content-module="geo-operator"\]/);
  assert.match(css, /\[data-google-bulk-summary\]/);
});

test("step 15: Notion and technical tools retain the original destinations", () => {
  const tools = read("app/admin/nastroje/page.tsx");
  const notion = read("app/admin/nastroje/notion-audit/page.tsx");
  const layout = read("app/admin/layout.tsx");

  assert.match(tools, /data-admin-content-module="technical-tools"/);
  for (const href of [
    "/admin/import",
    "/admin/nastroje/notion-audit",
    "/admin/nastroje/geo",
    "/admin/nastroje/google-places",
    "/admin/nastroje/address-enrichment",
  ]) {
    assert.ok(tools.includes('href="' + href + '"'), href);
  }
  assert.match(notion, /data-admin-content-module="notion-audit"/);
  assert.match(notion, /<AdminNotionSyncOverview/);
  assert.match(notion, /<AdminNotionDataQualityAudit/);
  assert.match(layout, /import "\.\/admin-operations-step15\.css";/);
});

test("step 15: styling stays in the admin shell without concealing document overflow", () => {
  const globalCss = read("app/admin/admin-operations-step15.css");
  const localCss = read("components/admin-missing-quality-dashboard.module.css");
  const addition = localCss.slice(localCss.indexOf("ADMIN VISUAL 15/18"));

  assert.match(globalCss, /\[data-admin-workspace\]/);
  assert.ok(addition.length > 400);
  for (const css of [globalCss, addition]) {
    assert.doesNotMatch(css, /overflow-x:\s*hidden/);
    assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html)\s*\{/);
    assert.match(css, /min-width:\s*0/);
  }
});
