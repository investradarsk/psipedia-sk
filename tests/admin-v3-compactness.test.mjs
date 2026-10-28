import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const css = {
  global: read("app/admin/admin-workspace.css"),
  shell: read("components/admin-shell.module.css"),
  navigation: read("components/admin-navigation.module.css"),
  dashboard: read("components/admin-workspace-dashboard.module.css"),
  editor: read("components/admin-editor-workspace.module.css"),
  directory: read("components/admin-directory-editor.module.css"),
  services: read("components/admin-service-catalog.module.css"),
  gemini: read("components/admin-gemini-automation.module.css"),
  facebook: read("components/admin-facebook-images.module.css"),
};

const compact = (name) => {
  const source = css[name];
  const marker = source.lastIndexOf("/* ADMIN-V3-COMPACT-01");
  assert.ok(marker !== -1, name + " has the shared compact contract");
  return source.slice(marker);
};

test("compact admin treatment covers shared surfaces and specialized workspaces", () => {
  for (const name of Object.keys(css)) assert.ok(compact(name).length > 100, name);
  for (const selector of [
    ".admin-heading", ".admin-stats", ".admin-toolbar", ".admin-form-card",
    ".admin-article-row", ".admin-quality-profile-row", ".admin-quality-media-card",
  ]) assert.ok(compact("global").includes(selector), selector);
  for (const selector of [".metricCard", ".queueLink", ".panel", ".priorityGrid"]) {
    assert.ok(compact("dashboard").includes(selector), selector);
  }
  for (const selector of [".navigation", ".content", ".actionBar", ".pageWorkspace"]) {
    assert.ok(compact("editor").includes(selector), selector);
  }
  for (const name of ["services", "gemini", "facebook", "directory"]) {
    assert.match(compact(name), /@media \(max-width: (?:390|540|600|800)px\)/);
  }
});

test("compactness is admin-only and retains explicit mobile drawer clearance", () => {
  assert.match(compact("global"), /\[data-admin-workspace\] \.admin-heading/);
  assert.match(compact("global"), /--admin-v3-card-padding: 12px/);
  assert.match(compact("shell"), /grid-template-columns: 210px minmax\(0, 1fr\)/);
  assert.match(compact("shell"), /padding: 8px 64px 8px 12px/);
  assert.match(compact("navigation"), /\.mobileGroup a \{ min-height: 44px/);
  assert.match(compact("navigation"), /\.groupButton \{ min-height: 44px/);
  assert.doesNotMatch(compact("global"), /overflow-x:\s*hidden/);
  assert.doesNotMatch(compact("editor"), /display:\s*none/);
});

test("reduced whitespace never trades away core mobile hit targets", () => {
  assert.match(compact("global"), /\.admin-status-filter button \{ min-height: 44px/);
  assert.match(compact("global"), /\.admin-pagination :is\(a, span\) \{ min-height: 44px/);
  assert.match(compact("dashboard"), /\.actionRow a, \.quickLinks a \{ min-height: 44px/);
  assert.match(compact("editor"), /\.navigation button \{ min-height: 44px/);
  assert.match(compact("gemini"), /\.allConceptsCtaAction \{ min-height: 44px/);
  assert.match(compact("facebook"), /\.calendarDayButton \{ min-height: 49px/);
  assert.match(compact("services"), /\.listItem \{[^}]*min-height: 44px/);
  assert.match(compact("services"), /\.profileRow select \{ width: 100%; \}/);
  assert.match(compact("directory"), /\.toplineActions :global\(button\) \{ min-height: 44px/);
});

test("mobile article filter contract prevents vertical flex growth", () => {
  const source = read("app/admin/admin-workspace.css");
  const start = source.indexOf("/* ADMIN-MOBILE-DENSITY-20261028");
  assert.ok(start > 0, "admin-only mobile correction exists");
  const mobile = source.slice(start);
  assert.match(mobile, /form\.admin-toolbar\[role="search"\]\[action="\/admin\/clanky"\]/);
  assert.match(mobile, /form\.admin-toolbar\[role="search"\]\[action="\/admin\/steniatka"\]/);
  assert.match(mobile, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.admin-select-filter\s*\{[^}]*flex:\s*none/);
  assert.match(mobile, /\.admin-toolbar > :is\(\.admin-search, \.admin-select-filter\)\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(mobile, /@media \(max-width: 340px\)/);
  assert.doesNotMatch(mobile, /overflow-x:\s*hidden/);
});

test("narrow article cards and editor retain usable action targets", () => {
  const rows = read("components/admin-list-row.module.css");
  const filters = read("components/admin-article-dashboard.module.css");
  const article = read("components/admin-content-editor-v3.module.css");
  assert.match(rows, /grid-template-columns: 24px 58px minmax\(0, 1fr\)/);
  assert.match(rows, /\.actions :is\(a, button\) \{ min-height: 44px/);
  assert.match(filters, /\.quickFilters\s*\{\s*display: grid/);
  assert.match(article, /\.articleForm :global\(\.admin-rich-toolbar button\)[\s\S]*min-height: 44px/);
});
