import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin font tokens are scoped to its workspace, matching the article editor", () => {
  const admin = read("app/admin/admin-editorial-foundation.css");
  const workspace = read("components/admin-editor-workspace.module.css");
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /import "\.\/admin-editorial-foundation\.css";/);
  assert.match(admin, /\[data-admin-workspace\]\s*\{/);
  assert.match(admin, /--admin-ui-font-family:\s*ui-sans-serif, system-ui/);
  assert.match(admin, /--admin-ui-type-heading:\s*clamp\(/);
  assert.match(admin, /--admin-ui-type-section:\s*1\.05rem/);
  assert.match(admin, /font-family:\s*var\(--admin-ui-font-family\)/);
  assert.match(workspace, /font-family:\s*var\(--admin-ui-font-family,/);
  assert.doesNotMatch(admin, /(^|\n)\s*(?:body|html|:root)\s*\{/);
});

test("All canonical admin labels and compact overview metrics use common size tokens", () => {
  const admin = read("app/admin/admin-editorial-foundation.css");
  const legacyControls = read("app/admin/admin-workspace.css");
  const v4Forms = read("app/admin/admin-unified-forms.css");
  const dashboard = read("components/admin-workspace-dashboard.module.css");
  assert.match(admin, /--admin-ui-type-label:\s*0\.82rem/);
  assert.match(admin, /--admin-ui-type-stat:\s*clamp\(/);
  assert.match(legacyControls, /font-size:\s*var\(--admin-ui-type-label,/);
  assert.match(v4Forms, /font-size:\s*var\(--admin-ui-type-label,/);
  assert.match(dashboard, /\.metricValue strong\s*\{\s*font-family:\s*inherit;\s*font-size:\s*var\(--admin-ui-type-stat,/);
  assert.match(admin, /\.admin-heading h1\s*\{[^}]*font-size:\s*var\(--admin-ui-type-heading\)/s);
});

test("Legacy serif typography is removed from controls, not published-article previews", () => {
  const legacy = read("app/admin/admin-legacy-scoped.css");
  const extracted = read("app/admin/admin-root-extracted.css");
  const dashboard = read("components/admin-workspace-dashboard.module.css");
  const changedControls = [
    "admin-stats strong", "admin-field--title input",
    "admin-quality-tabs strong", "admin-quality-media-placeholder",
  ];
  for (const name of changedControls) {
    assert.match(legacy, new RegExp(name.replaceAll(".", "\\.").replaceAll("-", "-") + "\\s*\\{[^}]*font-family: var\\(--admin-ui-font-family", "s"), name);
  }
  assert.doesNotMatch(extracted, /font-family:\s*Georgia/);
  assert.doesNotMatch(dashboard, /font-family:\s*Georgia/);
  const preview = legacy.match(/font-family:\s*Georgia, "Times New Roman", serif;/g) ?? [];
  assert.equal(preview.length, 2, "Only rich article preview text may retain serif");
  assert.match(legacy, /\.admin-preview-intro\s*\{[^}]*font-family:\s*Georgia/s);
  assert.match(legacy, /\.admin-preview-paper section p,[^}]*font-family:\s*Georgia/s);
});

test("Mobile text inputs keep 16px to avoid iOS focus zoom", () => {
  const admin = read("app/admin/admin-editorial-foundation.css");
  const v4 = read("app/admin/admin-unified-forms.css");
  assert.match(admin, /@media \(max-width: 820px\)[\s\S]*?font-size:\s*16px/);
  assert.match(v4, /font-size:\s*16px/);
});
