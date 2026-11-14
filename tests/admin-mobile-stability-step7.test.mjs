import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 7: page-mode editors release sticky controls on text focus", () => {
  const css = read("components/admin-editor-workspace.module.css");
  const workspace = read("components/admin-editor-workspace.tsx");
  assert.match(css, /MOBILE-STABILITY STEP 7/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.pageWorkspace:has\(/);
  assert.match(css, /\[contenteditable="true"\]/);
  assert.match(css, /\[role="textbox"\]/);
  assert.match(css, /\) \.navigation\s*\{\s*position: static;\s*top: auto;/);
  assert.match(css, /\) \.pageActions\s*\{\s*position: static;\s*bottom: auto;/);
  assert.match(css, /\.pageWorkspace \.content pre\s*\{[^}]*overflow-x: auto;/);
  assert.match(workspace, /data-editor-page/);
  assert.match(workspace, /<EditorUnsavedChangesGuard/);
  assert.doesNotMatch(css, /html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/);
});

test("step 7: modal workspace fits the phone viewport and safe area", () => {
  const css = read("components/admin-editor-workspace.module.css");
  assert.match(css, /dialog\.workspaceModal\[open\]\s*\{[^}]*inset: 0;[^}]*box-sizing: border-box;[^}]*width: 100%;[^}]*max-width: 100%;/s);
  assert.match(css, /dialog\.workspaceModal\[open\]\s*\{[^}]*height: 100dvh;[^}]*max-height: 100dvh;[^}]*padding: env\(safe-area-inset-top\)/s);
  assert.match(css, /dialog\.workspaceModal\[open\] > div:nth-child\(2\)/);
  assert.match(css, /\.content,\.preview \{ height: 100%; overflow: auto;/);
  assert.doesNotMatch(css, /width: 100vw;/);
});

test("step 7: Tiptap color/link UI fits at 320px without browser focus zoom", () => {
  const css = read("components/admin-tiptap-article-editor.module.css");
  const source = read("components/admin-tiptap-article-editor.tsx");
  assert.match(css, /\.colorPanel\s*\{\s*box-sizing: border-box;/);
  assert.match(css, /\.paletteGrid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.paletteGrid \.paletteSwatch\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/s);
  assert.match(css, /\.hexControl input, \.linkBar input \{ min-width: 0; font-size: 16px; min-height: 44px; \}/);
  assert.match(css, /\.colorPanel :is\(button, input\[type="color"\]\),/);
  assert.match(css, /max-height: min\(55dvh, 420px\)/);
  assert.match(source, /data-tiptap-color-panel=\{target\}/);
  assert.match(source, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Escape"\)/);
});

test("step 7: secondary breed actions stay in the viewport on 320px phones", () => {
  const css = read("components/admin-breed-editor.module.css");
  const source = read("components/admin-breed-editor.tsx");
  assert.match(css, /@media \(max-width: 820px\)\s*\{\s*\.moreActionsPanel\s*\{\s*position: fixed;/);
  assert.match(css, /right: max\(12px, env\(safe-area-inset-right\)\)/);
  assert.match(css, /width: min\(340px, calc\(100dvw - 24px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)\)/);
  assert.match(css, /overflow-y: auto;/);
  assert.match(source, /data-breed-more-actions/);
  assert.match(source, /<AdminNotionProfileImportButton scope="breeds"/);
  assert.match(source, /<AdminRecordLifecycleActions kind="breeds"/);
});
