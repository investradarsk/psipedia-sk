import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeEditorialAuthorProfileInput,
  slugifyEditorialAuthorName,
} from "../lib/editorial-authors.ts";
import { normalizeEditorialExternalVideo } from "../lib/editorial-video.ts";

test("ARTICLE-ADMIN author profile input is bounded, typed and avatar-safe", () => {
  const normalized = normalizeEditorialAuthorProfileInput({
    displayName: "Redakcia Test",
    kind: "external",
    avatarUrl: "/media/authors/avatar.webp",
    shortBio: "Krátke bio.",
    role: "Odborný autor",
    active: true,
  });
  assert.equal(normalized.displayName, "Redakcia Test");
  assert.equal(normalized.kind, "external");
  assert.equal(normalized.avatarUrl, "/media/authors/avatar.webp");
  assert.equal(slugifyEditorialAuthorName("Žofia Čierna"), "zofia-cierna");

  assert.throws(
    () => normalizeEditorialAuthorProfileInput({ displayName: "A" }),
    /aspoň 2 znaky/,
  );
  assert.throws(
    () => normalizeEditorialAuthorProfileInput({ displayName: "Autor", avatarUrl: "http://example.com/avatar.jpg" }),
    /HTTPS/,
  );
  assert.throws(
    () => normalizeEditorialAuthorProfileInput({ displayName: "Autor", active: false, isDefault: true }),
    /Predvolený autor/,
  );
});

test("ARTICLE-ADMIN external video editor only accepts the merged YouTube/Vimeo contract", () => {
  assert.equal(
    normalizeEditorialExternalVideo({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })?.provider,
    "youtube",
  );
  assert.equal(
    normalizeEditorialExternalVideo({ url: "https://vimeo.com/123456789" })?.provider,
    "vimeo",
  );
  assert.equal(normalizeEditorialExternalVideo({ url: "https://example.com/video" }), null);
  assert.equal(normalizeEditorialExternalVideo({ url: "javascript:alert(1)" }), null);
  assert.equal(normalizeEditorialExternalVideo({ url: '<iframe src="https://youtube.com/embed/dQw4w9WgXcQ"></iframe>' }), null);
});

test("ARTICLE-ADMIN WYSIWYG writes canonical AST and strips rich HTML paste at the editing boundary", () => {
  const editor = readFileSync("components/admin-rich-text-editor.tsx", "utf8");
  assert.match(editor, /contentEditable/);
  assert.match(editor, /normalizeEditorialRichText/);
  assert.match(editor, /sanitizeEditorialHref/);
  assert.match(editor, /clipboardData\.getData\("text\/plain"\)/);
  assert.match(editor, /\["script", "style", "iframe", "object", "embed"\]/);
  assert.match(editor, /insertUnorderedList/);
  assert.match(editor, /insertOrderedList/);
  assert.match(editor, /applyBlock\("h2"\)/);
  assert.match(editor, /applyBlock\("h3"\)/);
  assert.match(editor, /applyBlock\("blockquote"\)/);
  assert.match(editor, /runCommand\("undo"\)/);
  assert.match(editor, /runCommand\("redo"\)/);
  assert.match(editor, /restoreEditorSelection/);
  assert.match(editor, /selectionchange/);
  assert.match(editor, /aria-pressed=\{activeState\.bold\}/);
  assert.match(editor, /aria-pressed=\{activeState\.italic\}/);
  assert.match(editor, /aria-pressed=\{activeState\.bulletList\}/);
  assert.match(editor, /aria-pressed=\{activeState\.orderedList\}/);
  assert.match(editor, /aria-pressed=\{activeState\.h2\}/);
  assert.match(editor, /aria-pressed=\{activeState\.blockquote\}/);
  assert.doesNotMatch(editor, /window\.prompt/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
});

test("ARTICLE-ADMIN save path carries canonical rich text, author profile selection and dirty protection", () => {
  const articleEditor = readFileSync("components/admin-article-editor.tsx", "utf8");
  const blockEditor = readFileSync("components/admin-article-block-editor.tsx", "utf8");
  const store = readFileSync("lib/article-store.ts", "utf8");

  assert.match(articleEditor, /introRichText,/);
  assert.match(articleEditor, /takeawayRichText,/);
  assert.match(articleEditor, /authorProfileId:/);
  assert.match(articleEditor, /AdminStickyEditorNavigation/);
  assert.match(articleEditor, /beforeunload/);
  assert.match(articleEditor, /AdminEditorialAuthorField/);
  assert.match(articleEditor, /To najdôležitejšie <small>nepovinné<\/small>/);
  assert.match(articleEditor, /Vizuálne nastavenia <small>nepovinné<\/small>/);

  assert.match(blockEditor, /richText={block\.richText}/);
  assert.match(blockEditor, /pendingDeleteId/);
  assert.match(blockEditor, /normalizeEditorialExternalVideo/);
  assert.match(blockEditor, /Podporované sú iba bezpečné HTTPS odkazy na YouTube alebo Vimeo/);

  assert.doesNotMatch(store, /Novinka potrebuje pred publikovaním aspoň jeden overiteľný zdroj/);
  assert.match(articleEditor, /Zdroj je voliteľný/);
  assert.match(store, /Video musí byť bezpečný HTTPS odkaz na YouTube alebo Vimeo/);
});


test("ARTICLE-EDITOR-UX-FIX keeps hero ALT, caption and credit separate and nullable", () => {
  const articleEditor = readFileSync("components/admin-article-editor.tsx", "utf8");
  const articleStore = readFileSync("lib/article-store.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync("drizzle/0046_article_hero_image_metadata.sql", "utf8");
  const detail = readFileSync("components/article-detail.tsx", "utf8");

  assert.match(articleEditor, /article-image-alt/);
  assert.match(articleEditor, /Popis fotografie \/ Caption/);
  assert.match(articleEditor, /Zdroj \/ autor fotografie/);
  assert.match(articleEditor, /URL zdroja fotografie/);
  assert.match(articleStore, /imageCreditUrl/);
  assert.match(articleStore, /URL zdroja fotografie musí byť platná webová adresa/);
  assert.match(articleStore, /payload\.imageAlt === undefined \? existing\.imageAlt/);
  assert.match(articleStore, /payload\.imageCaption === undefined \? existing\.imageCaption/);
  assert.match(articleStore, /payload\.imageCredit === undefined \? existing\.imageCredit/);
  assert.match(articleStore, /payload\.imageCreditUrl === undefined \? existing\.imageCreditUrl/);
  assert.match(schema, /imageAlt: text\("image_alt"\)/);
  assert.match(schema, /imageCaption: text\("image_caption"\)/);
  assert.match(schema, /imageCredit: text\("image_credit"\)/);
  assert.match(schema, /imageCreditUrl: text\("image_credit_url"\)/);
  assert.match(migration, /ADD COLUMN image_alt TEXT/);
  assert.match(migration, /ADD COLUMN image_caption TEXT/);
  assert.match(migration, /ADD COLUMN image_credit TEXT/);
  assert.match(migration, /ADD COLUMN image_credit_url TEXT/);
  assert.doesNotMatch(migration, /UPDATE managed_articles/i);
  assert.match(detail, /article\.imageAlt \|\| article\.title/);
  assert.match(detail, /Foto:/);
  assert.match(detail, /rel="noopener noreferrer"/);
});

test("ARTICLE-ADMIN self-hosted media remains image-only until MEDIA-VIDEO-UPLOAD defines a safe contract", () => {
  const clientUpload = readFileSync("lib/admin-image-upload.ts", "utf8");
  const uploadRoute = readFileSync("app/api/admin/uploads/route.ts", "utf8");
  assert.match(clientUpload, /image\/jpeg/);
  assert.doesNotMatch(clientUpload, /video\/mp4/);
  assert.match(uploadRoute, /detectedImageType/);
  assert.doesNotMatch(uploadRoute, /video\/mp4/);
});


test("ARTICLE-ADMIN keeps built-in Novinky available for create flow", () => {
  const newPage = readFileSync("app/admin/novy/page.tsx", "utf8");
  const editor = readFileSync("components/admin-article-editor.tsx", "utf8");
  assert.match(newPage, /sekcia === "novinky"/);
  assert.match(editor, /option\.slug === "clanky" \|\| option\.slug === "novinky"/);
  assert.match(editor, /section\.slug !== "novinky"/);
});

test("ADMIN-ARTICLE-UX-V2 publish/schedule feedback is focused and visible", () => {
  const editor = readFileSync("components/admin-article-editor.tsx", "utf8");
  const shell = readFileSync("components/admin-shell.tsx", "utf8");
  const style = readFileSync("components/admin-shell.module.css", "utf8");
  assert.match(editor, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(editor, /resultRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(editor, /role=\{error \? "alert" : "status"\}/);
  assert.match(editor, /focusResult\(\)/);
  assert.match(shell, /styles\.topbarSticky/);
  assert.match(style, /\.topbarSticky\s*\{[^}]*position: sticky/s);
  assert.match(style, /\.stickyNav\s*\{[^}]*position: sticky/s);
});


test("ADMIN-ARTICLE-EDITOR-NAV-1 uses canonical block IDs for keyboard-accessible preview navigation", () => {
  const editor = readFileSync("components/admin-article-editor.tsx", "utf8");
  const blocks = readFileSync("components/admin-article-block-editor.tsx", "utf8");
  const renderer = readFileSync("components/article-blocks.tsx", "utf8");
  const styles = readFileSync("components/admin-article-preview-nav.module.css", "utf8");
  assert.match(blocks, /id={`admin-editor-block-\${block.id}`}/);
  assert.match(editor, /onNavigateBlock=\{\(blockId\) => navigatePreview\(blockId\)\}/);
  assert.match(editor, /getElementById\(field \? targetId : `admin-editor-block-\${targetId}`\)/);
  assert.match(renderer, /onNavigateBlock\(block.id\)/);
  assert.match(renderer, /event.key === "Enter" \|\| event.key === " "/);
  assert.match(renderer, /tabIndex=\{0\}/);
  assert.match(editor, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(editor, /target\.scrollIntoView\(\{ behavior: "smooth", block: "center", inline: "nearest" \}\)/);
  assert.match(styles, /scroll-margin-top:/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /targetHighlight/);
});
