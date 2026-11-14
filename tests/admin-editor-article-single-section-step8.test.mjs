import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("ARTICLE-TIPTAP-2: section switch preserves mounted fields and matches left navigation order", () => {
  const src = read("components/admin-article-editor.tsx");
  const css = read("components/admin-content-editor-v3.module.css");
  const shells = [
    read("app/admin/clanky/[id]/page.tsx"),
    read("app/admin/novy/page.tsx"),
  ];
  const ids = ["publish", "authors", "settings", "seo", "relations", "media", "basics", "content", "blocks"];
  for (const name of ids) {
    const id = "article-" + name;
    assert.ok(src.includes('<section id="' + id + '"'), "Article section remains mounted: " + id);
    if (name !== "content") assert.ok(src.includes('{ id: "' + id + '", label:'), "Nav entry " + id);
    const visibleId = name === "content" ? "basics" : name;
    assert.ok(src.includes('hidden={activeArticleSection !== "article-' + visibleId + '"}'), "Section hidden while inactive: " + id);
  }
  assert.equal((src.match(/\{ id: "article-/g) ?? []).length, 8);
  assert.ok(src.includes('sectionMode="switch"'));
  assert.ok(src.includes('useState<string>("article-publish")'));
  assert.ok(src.includes('activeSectionId={activeArticleSection}'));
  assert.ok(src.includes('onSectionChange={setActiveArticleSection}'));
  assert.ok(src.includes('editorStyles.introCard'));
  assert.ok(src.includes('editorStyles.introContinuation'));
  assert.ok(src.includes('editorStyles.selectedBreedTags'));
  assert.ok(src.includes('breedPickerOpen'));
  assert.ok(src.includes('data-article-facebook-disclosure'));
  assert.ok(src.includes('data-article-seo-advanced'));
  assert.ok(css.includes('data-editor-layout="article"'));
  assert.ok(css.includes('data-editor-section-mode="switch"'));
  assert.ok(shells.every(s => s.includes("compactHeading")));
  const order = ids.map(id => src.indexOf('<section id="article-' + id + '"'));
  assert.ok(order.every((value, index) => value >= 0 && (index === 0 || value > order[index - 1])));
  const nav = src.slice(src.indexOf("const editorNavigation = ["), src.indexOf("];", src.indexOf("const editorNavigation = [")));
  const navOrder = ids.filter(id => id !== "content").map(id => nav.indexOf('id: "article-' + id + '"'));
  assert.ok(navOrder.every((value, index) => value >= 0 && (index === 0 || value > navOrder[index - 1])));
});

test("EDITOR-8: submit validation reveals hidden required fields, publication decisions stay server-owned", () => {
  const src = read("components/admin-article-editor.tsx");
  assert.match(src, /id="article-canonical-editor-form" noValidate/);
  assert.match(src, /function submitArticleForm\(\)/);
  for (const field of ["title", "excerpt", "intro", "slug", "portalSubpage"]) {
    assert.match(src, new RegExp("!" + field + "\\.trim\\(\\)"));
  }
  assert.match(src, /chooseArticleSection\(missing\.section\)/);
  assert.match(src, /void save\(displayedStatus\)/);
  assert.match(src, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); submitArticleForm\(\); \}\}/);
  assert.match(src, /method: article \? "PUT" : "POST"/);
  assert.match(src, /expectedUpdatedAt: lastSavedUpdatedAtRef\.current/);
  assert.match(src, /<EditorActionBar/);
  assert.match(src, /<ArticleEditorCalendar/);
  assert.match(src, /<AdminRecordLifecycleActions/);
  assert.match(src, /<ImageDisplayEditor/);
  assert.match(src, /<AdminArticleBlockEditor/);
  assert.match(src, /<AdminEditorialAuthorField/);
  assert.match(src, /<AdminArticleTopicPicker/);
});

test("EDITOR-8: live preview, Lexical, SEO, media, FB and QA remain functional in their existing components", () => {
  const src = read("components/admin-article-editor.tsx");
  assert.match(src, /previewOpen, setPreviewOpen\] = useState\(true\)/);
  assert.match(src, /<AdminArticleFullscreenPreview/);
  assert.match(src, /setActiveArticleSection\(visibleId\)/);
  assert.match(src, /chooseArticleSection\("article-publish"\)/);
  assert.match(src, /firstBlocker\?\.blockId \? "article-blocks"/);
  assert.match(src, /<AdminLexicalTextField/);
  assert.match(src, /<RichTextInput/);
  assert.match(src, /<AdminSingleImageUpload/);
  assert.match(src, /<AdminRecordLifecycleActions/);
  assert.match(src, /onUnpublished=\{/);
  assert.match(src, /setFbDateTime\(/);
  assert.match(src, /noindex/);
  assert.match(src, /setSeoTitle\(/);
  assert.match(src, /setTopicIds\(/);
  assert.match(src, /<AdminFormFeedback/);
  assert.match(src, /dirtyRef\.current/);
  assert.doesNotMatch(read("components/admin-editor-section-visibility.tsx"), /fetch\s*\(|DATABASE_URL/);
});

test("ARTICLE-VISUAL-3: the right rail reuses existing status, schedule, SEO and full preview", () => {
  const src = read("components/admin-article-editor.tsx");
  const css = read("components/admin-content-editor-v3.module.css");
  assert.match(src, /data-article-editor-rail/);
  assert.match(src, /aria-label="Stav článku"/);
  assert.match(src, /aria-label="Publikovanie článku"/);
  assert.match(src, /data-article-rail-seo/);
  assert.match(src, /data-article-compact-preview/);
  assert.doesNotMatch(src, /id="article-rail-published-at"/);
  assert.match(src, /data-article-publication-summary/);
  assert.match(src, /id="article-published-at"/);
  assert.match(src, /value=\{publishedAt\} readOnly=\{displayedStatus === "published"\}/);
  assert.match(src, /onClick=\{\(\) => chooseArticleSection\("article-seo"\)\}/);
  assert.match(src, /onClick=\{\(\) => chooseArticleSection\("article-publish"\)\}/);
  assert.match(src, /onClick=\{\(\) => void save\("scheduled"\)\}/);
  assert.match(src, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.match(src, /<AdminRecordLifecycleActions/);
  assert.match(src, /onUnpublished=\{/);
  assert.match(src, /fullscreenPreviewOpen \&\&/);
  assert.match(src, /<AdminArticleBlockEditor/);
  assert.match(css, /\.rightRail/);
  assert.match(css, /\.railCard/);
  assert.match(css, /\.railPreviewCard/);
  // No separate publication/SEO payload or API path is introduced by the visual rail.
  assert.equal((src.match(/method: article \? "PUT" : "POST"/g) ?? []).length, 1);
  assert.equal((src.match(/expectedUpdatedAt: lastSavedUpdatedAtRef\.current/g) ?? []).length, 1);
});

test("EDITOR-8: event and directory editors migrate only in their later steps", () => {
  const directory = read("components/admin-directory-editor.tsx");
  const events = read("components/admin-event-editor.tsx");
  assert.match(directory, /mode: "switch"/); // Step 9
  assert.match(events, /sectionMode="switch"/); // Step 10
});
