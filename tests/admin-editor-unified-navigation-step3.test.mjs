import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-3: one shared accessible navigation serves all three editor shells", () => {
  const core = read("components/admin-shared-editor-navigation.tsx");
  const pilot = read("components/admin-unified-editor-workspace.tsx");
  const canonical = read("components/admin-editor-workspace.tsx");
  const sticky = read("components/admin-interaction-system.tsx");
  for (const source of [pilot, canonical, sticky]) {
    assert.match(source, /<AdminSharedEditorNavigation/);
  }
  assert.match(core, /layout\?: "horizontal" \| "sidebar"/);
  assert.match(core, /mode\?: "scroll" \| "switch"/);
  assert.match(core, /type="button"/);
  assert.match(core, /href=\{/);
  assert.match(core, /event\.preventDefault\(\)/);
  assert.match(core, /useId\(\)/);
  assert.match(core, /<select/);
  assert.match(core, /disabled=\{!ready\}/);
  assert.match(core, /aria-current/);
  assert.match(pilot, /layout="sidebar" mode="switch"/);
  assert.match(sticky, /mode="scroll"/);
});

test("EDITOR-3: desktop page editors scroll the document, modal scroll stays isolated", () => {
  const canonical = read("components/admin-editor-workspace.tsx");
  const css = read("components/admin-editor-workspace.module.css");
  const eventCss = read("components/admin-event-editor.module.css");

  assert.match(canonical, /if \(mode === "page"\)/);
  assert.match(canonical, /target\.scrollIntoView/);
  assert.match(canonical, /pane\.scrollTo/);
  assert.match(canonical, /IntersectionObserver/);
  assert.match(canonical, /<EditorHeader status=\{status\}/);
  assert.match(css, /UNIFIED-EDITOR-3/);
  assert.match(css, /\.pageWorkspace\s*\{\s*overflow:\s*visible/);
  assert.match(css, /\.pageWorkspace\s*>\s*\.workspace\s*\{[^}]*max-height:\s*none/s);
  assert.match(css, /\.pageWorkspace\s*\.content,\s*\.pageWorkspace\s*\.preview\s*\{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.pageWorkspace\s*\.navigation\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /dialog\.workspaceModal\[open\][^{]*\{[^}]*overflow:\s*hidden/s);
  assert.ok(eventCss.lastIndexOf("height: auto;") > eventCss.indexOf("height: min(76dvh"), "event viewport cap gets overridden");
});

test("EDITOR-3: the shared presentation does not take over storage, APIs or publication", () => {
  const core = read("components/admin-shared-editor-navigation.tsx");
  const pilot = read("components/admin-unified-editor-workspace.tsx");
  const canonical = read("components/admin-editor-workspace.tsx");
  const sticky = read("components/admin-interaction-system.tsx");
  assert.doesNotMatch(core, /fetch\s*\(|database\.prepare|notion\.pages|localStorage|publishArticle/);
  assert.doesNotMatch(pilot, /fetch\s*\(|database\.prepare|notion\.pages/);
  assert.match(canonical, /beforeunload/);
  assert.match(canonical, /Neuložené zmeny/);
  assert.match(sticky, /useSyncExternalStore/);
  assert.match(sticky, /window\.history\.replaceState/);
});
