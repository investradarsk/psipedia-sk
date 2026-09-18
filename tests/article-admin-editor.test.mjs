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

  assert.match(store, /portalSection === "novinky" && status !== "draft" && !sources\.length/);
  assert.match(store, /Video musí byť bezpečný HTTPS odkaz na YouTube alebo Vimeo/);
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
  const newPage = read("app/admin/novy/page.tsx");
  const editor = read("components/admin-article-editor.tsx");
  assert.match(newPage, /sekcia === "novinky"/);
  assert.match(editor, /option\.slug === "clanky" \|\| option\.slug === "novinky"/);
  assert.match(editor, /section\.slug !== "novinky"/);
});
