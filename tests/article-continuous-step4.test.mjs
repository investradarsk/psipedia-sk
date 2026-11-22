import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleToCanonicalContinuousDocument } from "../lib/article-continuous-document.ts";
import { continuousDocumentToArticleFields } from "../lib/article-continuous-roundtrip.ts";
import { legacyRichTextToDocument } from "../lib/editorial-content.ts";

function fixture() {
  const intro = "Úvodný **text** s odkazom.";
  return {
    intro,
    introRichText: legacyRichTextToDocument(intro),
    takeaway: "Dôležitá veta",
    takeawayRichText: legacyRichTextToDocument("**Dôležitá** veta"),
    blocks: [
      { id: "t1", type: "text", content: "Pôvodný **odsek**", richText: legacyRichTextToDocument("Pôvodný **odsek**"), alignment: "center", future: ["retain"] },
      { id: "h2", type: "h2", text: "Nadpis" },
      { id: "img", type: "image", url: "/media/a.webp", imageKey: "original-key", alt: "Fotografia", caption: "Starý popis", credit: "Autor", size: "wide" },
      { id: "s1", type: "source", label: "Výskum", url: "https://example.org/1", accessedAt: "2026-11-22" },
      { id: "cta", type: "cta", text: "Pozrieť", buttonText: "Ponuka", url: "https://example.org/dognet", sponsored: true, newTab: true },
      { id: "s2", type: "source", label: "Výskum 2", url: "https://example.org/2" },
      { id: "gal", type: "gallery", images: [{ url: "/media/g.webp", imageKey: "gallery-original", alt: "G" }] },
      { id: "video", type: "embed", url: "https://youtu.be/2LQ2G9ZBzWc", title: "Video", caption: "Pôvodný popis" },
    ],
  };
}
function convert(document, original = fixture(), requiredIds = []) {
  return continuousDocumentToArticleFields(document, {
    originalIntro: { intro: original.intro, introRichText: original.introRichText },
    requiredNativeBlockIds: requiredIds,
  });
}

test("CONTINUOUS STEP 4: clean editor read returns exact original ArticleBlock objects and raw introduction", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const document = articleToCanonicalContinuousDocument(input);
  const result = convert(document, input, input.blocks.filter(b => !["text", "h2", "h3"].includes(b.type)).map(b => b.id));
  assert.equal(result.intro, input.intro);
  assert.deepEqual(result.introRichText, input.introRichText);
  assert.deepEqual(result.takeawayRichText, input.takeawayRichText);
  assert.equal(result.takeaway, input.takeaway);
  assert.deepEqual(result.blocks, input.blocks);
  assert.equal(JSON.stringify(input), before);
});

test("CONTINUOUS STEP 4: body text edit retains link/bold, alignment, original IDs and native media", () => {
  const original = fixture();
  const document = articleToCanonicalContinuousDocument(original);
  const paragraph = document.content.find(node => node.attrs?.sourceBlockId === "t1");
  paragraph.content[0].text = "Upravený ";
  const result = convert(document, original);
  assert.equal(result.blocks[0].id, "t1");
  assert.equal(result.blocks[0].type, "text");
  assert.equal(result.blocks[0].alignment, "center");
  assert.equal(result.blocks[0].future[0], "retain");
  assert.equal(result.blocks[0].content.includes("Upravený"), true);
  assert.equal(result.blocks[0].richText.content[0].content.some(n => n.marks?.some(m => m.type === "bold")), true);
  assert.deepEqual(result.blocks.slice(1), original.blocks.slice(1));
  assert.equal(result.intro, original.intro, "body-only edit must not rewrite raw Markdown intro");
});

test("CONTINUOUS STEP 4: native widget form can update image while keeping original imageKey and source order", () => {
  const input = fixture();
  const document = articleToCanonicalContinuousDocument(input);
  const image = document.content.find(node => node.attrs?.sourceBlockId === "img");
  image.attrs.block = { ...image.attrs.block, caption: "Nový popis" };
  const result = convert(document, input);
  assert.equal(result.blocks[2].caption, "Nový popis");
  assert.equal(result.blocks[2].imageKey, "original-key");
  assert.deepEqual(result.blocks.filter(b => b.type === "source").map(b => b.id), ["s1", "s2"]);
  assert.equal(result.blocks[4].url, "https://example.org/dognet");
  assert.equal(result.blocks[4].sponsored, true);
});

test("CONTINUOUS STEP 4: editor can append a new paragraph and new heading without touching original blocks", () => {
  const input = fixture();
  const document = articleToCanonicalContinuousDocument(input);
  document.content.push({ type: "paragraph", content: [{ type: "text", text: "Nová veta v článku." }] });
  document.content.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Nový podnadpis" }] });
  const result = convert(document, input);
  assert.deepEqual(result.blocks.slice(0, -2), input.blocks);
  assert.equal(result.blocks.at(-2).type, "text");
  assert.match(result.blocks.at(-2).content, /Nová veta/);
  assert.equal(result.blocks.at(-1).type, "h3");
  assert.equal(result.blocks.at(-1).text, "Nový podnadpis");
});

test("CONTINUOUS STEP 4: empty intro is editable and becomes intro without spilling into body", () => {
  const input = fixture();
  input.intro = "";
  input.introRichText = legacyRichTextToDocument("");
  const document = articleToCanonicalContinuousDocument(input);
  document.content[0].content = [{ type: "text", text: "Nový úvod pred telom." }];
  const result = convert(document, input);
  assert.equal(result.intro, "Nový úvod pred telom.");
  assert.deepEqual(result.blocks, input.blocks);
});

test("CONTINUOUS STEP 4: breakage, unconfirmed deletions and unsupported content reject whole save", () => {
  const input = fixture();
  const full = articleToCanonicalContinuousDocument(input);
  const requiredIds = ["img", "s1", "cta", "s2", "gal", "video"];
  const deleted = structuredClone(full);
  deleted.content = deleted.content.filter(node => node.attrs?.sourceBlockId !== "img");
  assert.throws(() => convert(deleted, input, requiredIds), /Chýba pôvodný vložený blok/);
  const badBoundary = structuredClone(full);
  badBoundary.content = badBoundary.content.filter(node => node.attrs?.kind !== "boundary");
  assert.throws(() => convert(badBoundary, input), /hranicu/);
  const badTakeaway = structuredClone(full);
  badTakeaway.content = badTakeaway.content.filter(node => node.attrs?.kind !== "takeaway");
  assert.throws(() => convert(badTakeaway, input), /To najdôležitejšie/);
  const malformed = structuredClone(full);
  malformed.content.push({ type: "customFuture", text: "NEMAZAŤ TENTO TEXT" });
  assert.throws(() => convert(malformed, input), /Nepodporovaný uzol/);
  const unsafe = structuredClone(full);
  unsafe.content.find(node => node.attrs?.sourceBlockId === "t1").content[0].marks = [{ type: "unsupportedMark" }];
  assert.throws(() => convert(unsafe, input), /Unsupported Tiptap mark/);
});

test("CONTINUOUS STEPS 3–5: editable workspace exists without a new storage or Notion write path", () => {
  const ui = readFileSync("components/admin-article-continuous-editor.tsx", "utf8");
  const parent = readFileSync("components/admin-article-editor.tsx", "utf8");
  const roundtrip = readFileSync("lib/article-continuous-roundtrip.ts", "utf8");
  assert.match(ui, /data-article-continuous-editable/);
  assert.match(ui, /continuousDocumentToArticleFields/);
  assert.match(ui, /AdminArticleBlockEditor/);
  assert.match(parent, /<AdminArticleContinuousEditor/);
  assert.match(parent, /setIntro\(fields\.intro\)/);
  assert.match(parent, /setBlocks\(fields\.blocks\)/);
  assert.match(parent, /async function save\(nextStatus/);
  assert.doesNotMatch(ui + roundtrip, /fetch\(|saveManagedArticle|blocks_json\s*=|notion\.pages\.update/);
});
