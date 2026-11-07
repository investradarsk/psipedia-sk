import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { editorialToTiptap, tiptapToEditorial } from "../lib/tiptap-editorial-bridge.ts";
import { normalizeEditorialRichText, legacyRichTextToDocument } from "../lib/editorial-content.ts";

test("audited rich text v1 nodes survive a Tiptap JSON round trip", () => {
  const original = normalizeEditorialRichText({
    version: 1, type: "doc", content: [
      { type: "paragraph", content: [
        { type: "text", text: "Psipedia", marks: [{ type: "bold" }, { type: "link", href: "/clanky" }] },
        { type: "hardBreak" }, { type: "text", text: "Pokračovanie", marks: [{ type: "italic" }] },
      ] },
      { type: "heading", level: 2, content: [{ type: "text", text: "Hlavný nadpis" }] },
      { type: "heading", level: 3, content: [{ type: "text", text: "Podnadpis" }] },
      { type: "bulletList", items: [[{ type: "text", text: "Položka" }]] },
      { type: "orderedList", items: [[{ type: "text", text: "Prvý krok" }]] },
      { type: "blockquote", content: [{ type: "text", text: "Citácia" }] },
      { type: "callout", tone: "warning", content: [{ type: "text", text: "Pozor" }] },
    ],
  });
  assert.ok(original);
  const tiptap = editorialToTiptap(original);
  assert.equal(tiptap.content.at(-1)?.type, "psipediaCallout");
  assert.equal(tiptap.content.at(-1)?.attrs?.tone, "warning");
  assert.deepEqual(tiptapToEditorial(tiptap), original);
});

test("legacy prose is preserved through the bridge", () => {
  const original = legacyRichTextToDocument("## Cvičenie\n\n**Pes** a _výcvik_\n\n- Odrážka");
  assert.deepEqual(tiptapToEditorial(editorialToTiptap(original)), original);
});

test("v2 unrestricted hex colors, highlights and underline survive round-trip", () => {
  const styled = tiptapToEditorial({
    type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "Zelená", marks: [
        { type: "textStyle", attrs: { color: "#Aa11BB" } },
        { type: "highlight", attrs: { color: "#F2E456" } },
        { type: "underline" },
        { type: "bold" },
      ] },
    ] }],
  });
  assert.equal(styled.version, 2);
  assert.deepEqual(styled.content[0].content[0].marks, [
    { type: "color", color: "#aa11bb" },
    { type: "highlight", color: "#f2e456" },
    { type: "underline" },
    { type: "bold" },
  ]);
  assert.deepEqual(tiptapToEditorial(editorialToTiptap(styled)), styled);
});

test("invalid color CSS, unknown marks, unknown blocks and unsafe links fail closed", () => {
  for (const attrs of [{ color: "red" }, { color: "#12ab34; background:url(x)" }, { color: "rgb(1,2,3)" }]) {
    assert.throws(() => tiptapToEditorial({
      type: "doc", content: [{ type: "paragraph", content: [
        { type: "text", text: "Test", marks: [{ type: "textStyle", attrs }] },
      ] }],
    }), /Invalid Tiptap color/);
  }
  assert.throws(() => tiptapToEditorial({
    type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "X", marks: [{ type: "script" }] },
    ] }],
  }), /Unsupported Tiptap mark/);
  assert.throws(() => tiptapToEditorial({
    type: "doc", content: [{ type: "table", content: [] }],
  }), /Unsupported Tiptap block/);
  assert.throws(() => tiptapToEditorial({
    type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "X", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
    ] }],
  }), /Unsafe Tiptap link/);
});

test("links retain canonical URL validation", () => {
  const doc = tiptapToEditorial({
    type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "Web", marks: [{ type: "link", attrs: { href: "https://psipedia.sk" } }] },
    ] }],
  });
  assert.equal(doc.content[0].type, "paragraph");
  assert.deepEqual(doc.content[0].content[0].marks, [{ type: "link", href: "https://psipedia.sk/" }]);
});

test("malformed nested list or callout refuses save", () => {
  assert.throws(() => tiptapToEditorial({
    type: "doc", content: [{ type: "bulletList", content: [{
      type: "listItem", content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [{ type: "text", text: "B" }] },
      ],
    }] }],
  }), /Invalid Tiptap content length/);
  assert.throws(() => tiptapToEditorial({
    type: "doc", content: [{ type: "psipediaCallout", attrs: { tone: "other" }, content: [] }],
  }), /Unsupported callout tone/);
});

test("step 1 adapter is isolated from current API and public renderer", () => {
  for (const path of [
    "components/admin-article-editor.tsx",
    "lib/article-store.ts",
    "components/editorial-rich-text.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(new URL("../" + path, import.meta.url), "utf8"), /tiptap-editorial-bridge/);
  }
});
