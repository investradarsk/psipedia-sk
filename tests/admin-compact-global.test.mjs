import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("single compact stylesheet loads last and only on admin routes", () => {
  const layout = read("app/admin/layout.tsx");
  const imports = [...layout.matchAll(/^import "\.\/(admin-[^"]+\.css)";$/gm)].map((m) => m[1]);
  assert.equal(imports.at(-1), "admin-compact-global.css");
  assert.equal(imports.filter((name) => name === "admin-compact-global.css").length, 1);
  assert.match(layout, /<div data-admin-workspace>/);
});

test("compact layer inherits existing V3/V4 tokens without touching application code", () => {
  const css = read("app/admin/admin-compact-global.css");
  for (const token of [
    "--admin-ui-font-family", "--admin-ui-type-body", "--admin-ui-control-height",
    "--admin-ui-panel-padding", "--admin-ui-section-gap", "--admin-ui-editor-field-gap",
    "--admin-v3-card-radius"
  ]) assert.ok(css.includes(token), "Missing shared token: " + token);
  for (const target of [
    ".admin-form-card", ".admin-toolbar", ".admin-stats", ".admin-article-row",
    ".admin-table", "[data-admin-list-table]", "[data-admin-list-filters]",
    "[data-admin-list-pagination]", ".admin-field"
  ]) assert.ok(css.includes(target), "Missing shared surface: " + target);
  assert.doesNotMatch(css, /overflow-x:\s*hidden|position:\s*(fixed|sticky)|!important/);
  assert.doesNotMatch(css, /D1_MIGRATION|NOTION_SYNC|fetch\(|onClick|onSubmit/);
});

test("small desktop density does not shrink mobile touch targets or editable text", () => {
  const css = read("app/admin/admin-compact-global.css");
  assert.match(css, /--admin-ui-control-height:\s*38px/);
  assert.match(css, /@media \(min-width:\s*821px\)/);
  assert.match(css, /@media \(max-width:\s*820px\)/);
  assert.match(css, /--admin-ui-control-height:\s*44px/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /prefers-reduced-motion:\s*no-preference/);
});
