import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleBlocksToContinuousNodes,
  articleToCanonicalContinuousDocument,
} from "../lib/article-continuous-document.ts";
import { articleToContinuousReadOnlyDocument } from "../lib/article-continuous-readonly.ts";
import { legacyRichTextToDocument } from "../lib/editorial-content.ts";

const richText = legacyRichTextToDocument("Prvý **tučný** odsek.\n\nDruhý odsek.\n\n- jedna položka\n- druhá položka");

function inputFixture() {
  return {
    introRichText: legacyRichTextToDocument("Úvod s [odkazom](https://psipedia.sk)."),
    takeawayRichText: legacyRichTextToDocument("Kľúčový **poznatok**."),
    takeaway: "Pôvodný perexový súhrn nezameniť.",
    promoUtcDay: "2026-11-23",
    blocks: [
      { id: "prose", type: "text", content: "Nezmeniť starý obsah s **markdownom**.", richText, alignment: "right", extraFutureField: { nested: [1, "value"] } },
      { id: "heading-2", type: "h2", text: "Nadpis druhej úrovne" },
      { id: "photo", type: "image", imageKey: "media/dog-original", url: "/media/dog.webp", alt: "Labrador", caption: "Pôvodná fotografia", credit: "Autor", size: "wide" },
      { id: "research-1", type: "source", label: "Odborný zdroj A", url: "https://example.org/a", accessedAt: "2026-11-19", note: "Výskum A" },
      { id: "gallery", type: "gallery", images: [{ url: "/media/1.webp", imageKey: "media/gallery-1", alt: "Obrázok 1" }, { url: "/media/2.webp", imageKey: "media/gallery-2", alt: "Obrázok 2", caption: "Galéria" }] },
      { id: "heading-3", type: "h3", text: "Nadpis tretej úrovne" },
      { id: "bullets", type: "bullet-list", items: ["**Tučne**", "Viac položiek"] },
      { id: "numbers", type: "numbered-list", items: ["Prvý krok", "Druhý krok"] },
      { id: "tip", type: "tip", content: "Tip", richText: legacyRichTextToDocument("Tip s **tučným** písmom.") },
      { id: "warning", type: "warning", content: "Pozor!" },
      { id: "quote", type: "quote", content: "Citácia", attribution: "MVDr. Príklad" },
      { id: "table", type: "table", headers: ["Hmotnosť", "Vek"], rows: [["30 kg", "8 mesiacov"]] },
      { id: "research-2", type: "source", label: "Odborný zdroj B", url: "https://example.org/b", note: "Výskum B" },
      { id: "related", type: "related", href: "/clanky/suvisiaci", title: "Súvisiaci článok", description: "Súvisiaci text" },
      { id: "promo", type: "psipedia-promo", promoKey: "veterinari", variant: "auto" },
      { id: "cta", type: "cta", text: "Partnerský odkaz", buttonText: "Pozrieť", url: "https://example.org/p", newTab: true, sponsored: true },
      { id: "video", type: "embed", url: "https://www.youtube.com/watch?v=2LQ2G9ZBzWc", title: "Video", caption: "Popis videa", provider: "youtube", videoId: "2LQ2G9ZBzWc" },
    ],
  };
}

test("CONTINUOUS STEP 2: canonical conversion preserves every block, its index, order and exact JSON data", () => {
  const input = inputFixture();
  const before = JSON.stringify(input);
  const nodes = articleBlocksToContinuousNodes(input.blocks, { promoUtcDay: input.promoUtcDay });
  const serialized = JSON.parse(JSON.stringify(nodes));
  for (let index = 0; index < input.blocks.length; index += 1) {
    const members = serialized.filter(node => node.attrs?.sourceBlockIndex === index);
    assert.ok(members.length > 0, `Block ${index} must not disappear`);
    assert.ok(members.every(node => node.attrs.sourceBlockId === input.blocks[index].id));
    assert.ok(members.every(node => node.attrs.sourceField === "body"));
    assert.ok(members.every(node => node.attrs.sourceNodeCount === members.length));
    assert.deepEqual(members.map(node => node.attrs.sourceNodeIndex), members.map((_, i) => i));
    assert.ok(members.every(node => JSON.stringify(node.attrs.sourceBlock) === JSON.stringify(input.blocks[index])), `Block ${index} snapshot changed`);
    assert.notStrictEqual(nodes.find(node => node.attrs?.sourceBlockIndex === index).attrs.sourceBlock, input.blocks[index]);
  }
  assert.deepEqual([...new Set(serialized.map(node => node.attrs?.sourceBlockIndex))], input.blocks.map((_, i) => i));
  assert.equal(JSON.stringify(input), before, "projection must never mutate input");
  input.blocks[2].caption = "Changed only in form state";
  assert.equal(nodes.find(node => node.attrs?.sourceBlockId === "photo").attrs.block.caption, "Pôvodná fotografia");
  assert.deepEqual(nodes.find(node => node.attrs?.sourceBlockId === "prose").attrs.sourceBlock.extraFutureField, { nested: [1, "value"] });
});

test("CONTINUOUS STEP 2: one multiline rich-text block keeps its native marks and its original block identity", () => {
  const input = inputFixture();
  const nodes = articleBlocksToContinuousNodes(input.blocks);
  const prose = nodes.filter(node => node.attrs?.sourceBlockId === "prose");
  assert.deepEqual(prose.map(node => node.type), ["paragraph", "paragraph", "bulletList"]);
  assert.equal(prose[0].content.some(n => n.marks?.some(m => m.type === "bold")), true);
  assert.equal(prose[0].attrs.sourceBlock.alignment, "right");
  assert.equal(prose[0].attrs.sourceNodeCount, 3);
  assert.equal(nodes.find(node => node.attrs?.sourceBlockId === "heading-2").attrs.level, 2);
  assert.equal(nodes.find(node => node.attrs?.sourceBlockId === "heading-3").attrs.level, 3);
  for (const id of ["photo", "gallery", "bullets", "numbers", "tip", "warning", "quote", "table", "research-1", "research-2", "related", "promo", "cta", "video"]) {
    assert.equal(nodes.find(node => node.attrs?.sourceBlockId === id)?.type, "psipediaArticleWidget");
  }
});

test("CONTINUOUS STEP 2: sources are neither grouped nor deduplicated; public read-only preview keeps existing source display", () => {
  const input = inputFixture();
  input.blocks.splice(4, 0, { id: "research-dup", type: "source", label: "Duplikát", url: "https://example.org/a" });
  const canonical = articleToCanonicalContinuousDocument(input);
  assert.deepEqual(canonical.content.filter(node => node.attrs?.sourceBlockId?.startsWith("research")).map(node => node.attrs.sourceBlockId), [
    "research-1", "research-dup", "research-2",
  ]);
  const publicPreview = articleToContinuousReadOnlyDocument(input);
  assert.equal(publicPreview.content.at(-1).attrs.kind, "sources");
  assert.deepEqual(publicPreview.content.at(-1).attrs.blocks.map(block => block.id), ["research-1", "research-dup", "research-2"]);
  assert.equal(canonical.content.filter(node => node.attrs?.kind === "sources").length, 0);
});

test("CONTINUOUS STEP 2: explicit intro boundary and takeaway anchor survive empty fields; duplicate IDs stay distinct", () => {
  const input = inputFixture();
  input.introRichText = legacyRichTextToDocument("");
  input.takeaway = "";
  input.takeawayRichText = legacyRichTextToDocument("");
  input.blocks = [{ id: "same", type: "text", content: "" }, { id: "same", type: "text", content: "Druhý blok" }];
  const doc = articleToCanonicalContinuousDocument(input);
  assert.equal(doc.content[0]?.type, "paragraph", "empty intro needs an editable anchor");
  assert.equal(doc.content[0]?.attrs?.sourceField, "intro");
  assert.equal(doc.content[1]?.attrs?.kind, "boundary");
  assert.equal(doc.content[1]?.attrs?.sourceField, "intro-end");
  assert.equal(doc.content[2]?.attrs?.kind, "takeaway");
  assert.equal(doc.content[2]?.attrs?.rawTakeaway, "");
  assert.deepEqual(doc.content.slice(3).map(node => node.attrs?.sourceBlockIndex), [0, 1]);
  assert.equal(doc.content[3].type, "paragraph");
  assert.equal(doc.content[3].attrs.sourceBlockId, "same");
  assert.equal(doc.content[4].attrs.sourceBlockId, "same");
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(doc))).includes('"intro-end"'), true);
});

test("CONTINUOUS STEP 2: malformed and unsupported inputs fail visibly without any write or fallback", () => {
  const input = inputFixture();
  assert.throws(() => articleBlocksToContinuousNodes(null), /platným zoznamom/);
  assert.throws(() => articleBlocksToContinuousNodes([{ type: "text", content: "Chýba ID" }]), /Neplatný blok/);
  assert.throws(() => articleBlocksToContinuousNodes([{ id: "other", type: "future", payload: "MUST KEEP" }]), /Nepodporovaný typ bloku/);
  input.blocks = [{ id: "bad-rich-text", type: "text", content: "Pôvodný text", richText: { type: "doc", version: 999, content: [] } }];
  assert.throws(() => articleToCanonicalContinuousDocument(input), /Unsupported Psipedia editorial document/);

  const adapter = readFileSync("lib/article-continuous-document.ts", "utf8");
  const viewer = readFileSync("components/admin-article-continuous-readonly.tsx", "utf8");
  assert.doesNotMatch(adapter, /fetch\(|updateManagedArticle|saveManagedArticle|blocks_json\s*=|notion\.pages\.update/);
  assert.match(viewer, /editable: false/);
});
