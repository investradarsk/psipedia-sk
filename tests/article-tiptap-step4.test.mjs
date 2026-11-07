import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeEditorialRichText, editorialRichTextPlainText } from "../lib/editorial-content.ts";
import { editorialToTiptap, tiptapToEditorial } from "../lib/tiptap-editorial-bridge.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("ARTICLE-TIPTAP-4: v1 documents remain v1; canonical v2 safely preserves inline marks", () => {
  const old = { version: 1, type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Starý text", marks: [{ type: "bold" }] }] },
  ] };
  assert.deepEqual(normalizeEditorialRichText(old), old);
  assert.deepEqual(tiptapToEditorial(editorialToTiptap(old)), old);
  const next = { version: 2, type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Nový text", marks: [
      { type: "bold" }, { type: "color", color: "#1f4a3a" },
      { type: "highlight", color: "#fedeaa" }, { type: "underline" },
    ] }] },
  ] };
  assert.deepEqual(normalizeEditorialRichText(next), next);
  assert.equal(editorialRichTextPlainText(next), "Nový text");
  assert.deepEqual(tiptapToEditorial(editorialToTiptap(next)), next);
});

test("ARTICLE-TIPTAP-4: CSS injection and unrecognized v1 styles are never promoted", () => {
  const safe = normalizeEditorialRichText({
    version: 2, type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Test", marks: [
        { type: "color", color: "#bb1122;url(javascript:alert(1))" },
        { type: "highlight", color: "#abc123" },
      ] }],
    ],
  });
  assert.ok(safe);
  assert.deepEqual(safe.content[0].content[0].marks, [{ type: "highlight", color: "#abc123" }]);
  const legacy = normalizeEditorialRichText({
    version: 1, type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Legacy", marks: [
        { type: "color", color: "#abcdef" }, { type: "italic" },
      ] }],
    ],
  });
  assert.deepEqual(legacy.content[0].content[0].marks, [{ type: "italic" }]);
  assert.equal(normalizeEditorialRichText({ version: 3, type: "doc", content: [] }), null);
});

test("ARTICLE-TIPTAP-4: preview reuses public blocks/renderers and never saves or publishes", () => {
  const component = read("components/admin-article-fullscreen-preview.tsx");
  const parent = read("components/admin-article-editor.tsx");
  assert.match(component, /element\.showModal\(\)/);
  assert.match(component, /data-preview-device=\{device\}/);
  assert.match(component, /<EditorialRichText document=\{props\.introRichText\}/);
  assert.match(component, /<ArticleBlocks blocks=\{props\.blocks\} preview/);
  assert.match(component, /<ImageDisplay context="detail"/);
  assert.doesNotMatch(component, /fetch\(|\.submit\(|save\(|publish\(/);
  assert.match(parent, /<AdminArticleFullscreenPreview/);
  assert.match(parent, /setFullscreenPreviewOpen\(true\)/);
});

test("ARTICLE-TIPTAP-4: Notion synchronization rejects lossy outbound marks and guards styled inbound", () => {
  const outgoing = read("lib/notion-article-content-plan.ts");
  const incoming = read("lib/notion-article-sync.ts");
  assert.match(outgoing, /UNSUPPORTED_NOTION_EDITORIAL_STYLE/);
  assert.match(incoming, /preserveNotionUnrepresentableStyles/);
  assert.match(incoming, /NOTION_ARTICLE_STYLED_INTRO_REVIEW_REQUIRED/);
  assert.match(incoming, /NOTION_ARTICLE_STYLED_BLOCK_REVIEW_REQUIRED/);
});
