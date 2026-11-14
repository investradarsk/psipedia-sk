import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Work P2: contextual Tiptap toolbar only appears in text sections and stays one row", () => {
  const src = read("components/admin-tiptap-article-editor.tsx");
  const css = read("components/admin-tiptap-article-editor.module.css");
  const offsets = read("components/admin-content-editor-v3.module.css");
  assert.match(src, /formattingSection = activeSectionId === "article-basics" \|\| activeSectionId === "article-blocks"/);
  assert.match(src, /\{formattingSection && <TiptapSharedToolbar/);
  assert.match(src, /useLayoutEffect\(\(\) => \{/);
  assert.match(src, /new ResizeObserver\(update\)/);
  assert.match(css, /\.tools \{[^}]*flex-wrap: nowrap; overflow-x: auto/);
  assert.match(offsets, /--admin-tiptap-toolbar-height, 0px/);
  assert.match(offsets, /scroll-margin-top/);
});

test("Work P2: breed edit has one accessible page heading and one published save action", () => {
  const shared = read("components/admin-editor-workspace.tsx");
  const src = read("components/admin-breed-editor.tsx");
  assert.match(shared, /hidePageTitle = false/);
  assert.match(shared, /hideTitle=\{hidePageTitle\}/);
  assert.match(src, /hidePageTitle/);
  assert.match(src, /data-breed-more-actions/);
  assert.match(src, /form\.status === "published" \? \(/);
  assert.match(src, /type="submit" form="breed-canonical-editor-form"/);
  assert.match(src, /onClick=\{\(\)=>void save\("published"\)\}/);
  assert.doesNotMatch(src, /Uložiť a aktualizovať/);
  assert.match(src, /<AdminNotionProfileImportButton scope="breeds"/);
  assert.match(src, /<AdminRecordLifecycleActions kind="breeds"/);
  assert.match(src, /expectedUpdatedAt/);
  const css = read("components/admin-breed-editor.module.css");
  assert.match(css, /\.moreActionsPanel\s*\{[\s\S]*?position: absolute/);
});

test("Work P3: breed search and disabled action states have the same compact control style", () => {
  const css = read("components/admin-breed-dashboard.module.css");
  assert.match(css, /\.filters label:first-child \{[^}]*flex-direction: column/);
  assert.match(css, /\.filterActions :global\(button\)\s*\{/);
  assert.match(css, /\.filterActions :global\(button:disabled\)/);
});

test("Work P3: moderation labels are Slovak but stored filter enums remain unchanged", () => {
  const lib = read("lib/admin-profile-review-labels.ts");
  const list = read("app/admin/recenzie-profilov/page.tsx");
  const detail = read("app/admin/recenzie-profilov/[id]/page.tsx");
  assert.match(lib, /PENDING_REVIEW: "Čaká na kontrolu"/);
  assert.match(lib, /REMOVED: "Odstránená moderátorom"/);
  assert.match(lib, /"chovatelske-stanice": "Chovateľské stanice"/);
  assert.match(lib, /value === "DIRECTORY_PROFILE"/);
  assert.match(list, /<option key=\{item\} value=\{item\}>\{profileReviewStatusLabel\(item\)\}/);
  assert.match(list, /data\.filters\.status !== "PENDING_REVIEW"/);
  assert.match(list, /profileReviewEntityTypeLabel\(item\.entityType\)/);
  assert.match(detail, /profileReviewStatusLabel\(review\.status\)/);
  assert.match(detail, /profileReviewActionLabel\(event\.action\)/);
  assert.doesNotMatch(detail, /HMAC hash|Audit history|Risk flag/);
});

test("Work P3: reviews hub is compact with all original navigation destinations", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  const css = read("components/admin-reviews-hub.module.css");
  for (const dest of [
    "/admin/novy?sekcia=recenzie", "/admin/clanky?section=recenzie",
    "/admin/recenzie-profilov", "/admin/sekcie?sekcia=recenzie", "/admin/recenzie/eshopy",
  ]) assert.ok(hub.includes('href="' + dest + '"'), dest);
  assert.match(hub, /<details className=\{styles\.rules\}/);
  assert.match(hub, /<details className=\{styles\.eshopDetails\}/);
  assert.match(css, /\.workspace \{ gap: var\(--admin-ui-section-gap, 10px\)/);
  assert.match(css, /\.card \{ padding: 12px 13px/);
  assert.doesNotMatch(hub, /canonical modul|review workflow/);
});
