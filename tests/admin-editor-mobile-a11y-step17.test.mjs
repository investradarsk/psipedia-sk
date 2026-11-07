import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const nav = read("components/admin-shared-editor-navigation.tsx");
const navCss = read("components/admin-shared-editor-navigation.module.css");
const sectionCss = read("components/admin-interaction-system.module.css");
const workspaceCss = read("components/admin-editor-workspace.module.css");
const footer = read("components/admin-editor-footer.tsx");
const footerCss = read("components/admin-editor-footer.module.css");
const e2e = read("tests/e2e/admin-ux-unification.spec.ts");
const adoptionE2e = read("tests/e2e/adoption.spec.ts");
const lostFoundE2e = read("tests/e2e/lost-found-dogs.spec.ts");
const organizationE2e = read("tests/e2e/admin-organization-publication.spec.ts");

test("EDITOR-17: shared switch navigation is labeled, hydrate-safe and focuses revealed panels", () => {
  assert.match(nav, /useSyncExternalStore/);
  assert.match(nav, /const readyOnServer = \(\) => false/);
  assert.match(nav, /const navigationReady = ready && hydrated/);
  assert.match(nav, /data-admin-editor-nav-ready=\{navigationReady \? "true" : "false"\}/);
  assert.match(nav, /disabled=\{!navigationReady\}/);
  assert.match(nav, /aria-label=\{ariaLabel\}/);
  assert.match(nav, /aria-controls=\{item\.id\}/);
  assert.match(nav, /aria-controls=\{mode === "switch" \? currentId : undefined\}/);
  assert.match(nav, /<label className=\{styles\.mobile\} htmlFor=\{selectId\}>/);
  assert.match(nav, /<select id=\{selectId\} aria-label="Sekcia editora"/);
  assert.match(nav, /if \(mode !== "switch"\) return/);
  assert.match(nav, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(nav, /target\.matches\("\[data-admin-editor-section\]"\)/);
  assert.match(nav, /target\.hidden/);
  assert.match(nav, /target\.focus\(\{ preventScroll: false \}\)/);
  // Scroll mode must retain usable native anchors in the absence of JavaScript.
  assert.match(nav, /<a key=\{item\.id\} href=\{\`#\$\{encodeURIComponent\(item\.id\)\}\`\}/);
});

test("EDITOR-17: 320px navigation, section focus, motion and shared action bar are safe", () => {
  assert.match(navCss, /min-height: 44px/);
  assert.match(navCss, /:focus-visible/);
  assert.match(navCss, /@media \(max-width: 380px\)/);
  assert.match(navCss, /font-size: 16px/);
  assert.match(navCss, /overflow-wrap: anywhere/);
  assert.match(navCss, /prefers-reduced-motion: reduce/);
  assert.match(sectionCss, /\.editorSection:focus-visible/);
  assert.match(sectionCss, /outline: 3px solid var\(--admin-v3-focus/);
  assert.match(workspaceCss, /\.pageWorkspace\[data-editor-section-mode="switch"\][^]*:focus-visible/);
  assert.match(workspaceCss, /@media \(max-width: 380px\)/);
  assert.match(footerCss, /env\(safe-area-inset-bottom\)/);
  assert.match(footerCss, /min-height: 44px/);
  assert.match(footerCss, /max-width: 100%/);
  assert.match(footerCss, /overflow-wrap: anywhere/);
  assert.match(footer, /aria-busy=\{pending\}/);
  assert.match(footer, /role="status" aria-live="polite"/);
});

test("EDITOR-17: article uses document scrolling while the other canonical editor families retain switched navigation", () => {
  const article = read("components/admin-article-editor.tsx");
  assert.match(article, /sectionMode="scroll"/);
  assert.match(article, /articleLayout/);
  const workspace = ["components/admin-breed-editor.tsx", "components/admin-event-editor.tsx"];
  const standalone = [
    "components/admin-directory-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-adoption-editor.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-organization-editor.tsx",
  ];
  for (const file of workspace) {
    const src = read(file);
    assert.match(src, /<EditorWorkspace/, file);
    assert.match(src, /sectionMode="switch"/, file);
  }
  for (const file of standalone) {
    const src = read(file);
    assert.match(src, /<AdminSharedEditorNavigation/, file);
    assert.match(src, /mode="switch"/, file);
    assert.match(src, /AdminEditorSectionVisibility.Provider/, file);
  }
});

test("EDITOR-17: existing browser tests check focus, no data loss and small screens", () => {
  assert.match(e2e, /#\$\{target\}\`\)\)\.toBeFocused\(\)/);
  assert.match(e2e, /await expect\(field\)\.toHaveValue\(value\)/);
  assert.match(e2e, /await noOverflow\(page\)/);
  assert.match(e2e, /await accessible\(page\)/);
  assert.doesNotMatch(e2e, /a\[href\$="#\$\{target\}"\]/);
  for (const src of [adoptionE2e, lostFoundE2e, organizationE2e]) {
    assert.match(src, /toBeFocused\(\)/);
    assert.match(src, /1440, 390, 320/);
  }
  assert.doesNotMatch(nav, /fetch\(|DATABASE_URL|notion\.pages|localStorage/);
});
