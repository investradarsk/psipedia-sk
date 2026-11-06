import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-8: article has nine mounted navigable sections with one visible at a time", () => {
  const src = read("components/admin-article-editor.tsx");
  const css = read("components/admin-content-editor-v3.module.css");
  const ids = ["basics", "content", "blocks", "media", "settings", "relations", "authors", "publish", "seo"];
  for (const name of ids) {
    const id = "article-" + name;
    assert.match(src, new RegExp('id="' + id + '"[^>]*hidden=\\{activeArticleSection !== "' + id + '"\\}[^>]*data-admin-editor-section'));
    assert.match(src, new RegExp('\\{ id: "' + id + '", label:'));
  }
  assert.equal((src.match(/hidden=\{activeArticleSection !== "article-/g) ?? []).length, 9);
  assert.match(src, /sectionMode="switch"/);
  assert.match(src, /activeSectionId=\{activeArticleSection\}/);
  assert.match(src, /onSectionChange=\{setActiveArticleSection\}/);
  assert.match(src, /aria-label="Prechod medzi sekciami článku"/);
  assert.match(css, /\.articleForm > \[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
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
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /<ImageDisplayEditor/);
  assert.match(src, /<AdminArticleBlockEditor/);
  assert.match(src, /<AdminEditorialAuthorField/);
  assert.match(src, /<AdminArticleTopicPicker/);
});

test("EDITOR-8: live preview, Lexical, SEO, media, FB and QA remain functional in their existing components", () => {
  const src = read("components/admin-article-editor.tsx");
  assert.match(src, /previewOpen, setPreviewOpen\] = useState\(true\)/);
  assert.match(src, /navigatePreview\(targetId/);
  assert.match(src, /target\.closest<HTMLElement>\("\[data-admin-editor-section\]"\)/);
  assert.match(src, /chooseArticleSection\(targetId\)/);
  assert.match(src, /firstBlocker\?\.blockId \? "article-blocks"/);
  assert.match(src, /<AdminLexicalTextField/);
  assert.match(src, /<RichTextInput/);
  assert.match(src, /<AdminSingleImageUpload/);
  assert.match(src, /onClick=\{unpublish\}/);
  assert.match(src, /setFbDateTime\(/);
  assert.match(src, /noindex/);
  assert.match(src, /setSeoTitle\(/);
  assert.match(src, /setTopicIds\(/);
  assert.match(src, /<AdminFormFeedback/);
  assert.match(src, /dirtyRef\.current/);
  assert.doesNotMatch(read("components/admin-editor-section-visibility.tsx"), /fetch\s*\(|DATABASE_URL/);
});

test("EDITOR-8: other page editors do not silently switch to one-section mode", () => {
  const paths = ["components/admin-event-editor.tsx", "components/admin-directory-editor.tsx"];
  for (const path of paths) assert.doesNotMatch(read(path), /sectionMode="switch"/, path);
});
