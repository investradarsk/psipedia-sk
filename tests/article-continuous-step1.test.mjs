import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleToContinuousReadOnlyDocument } from "../lib/article-continuous-readonly.ts";
import { legacyRichTextToDocument } from "../lib/editorial-content.ts";

const intro = legacyRichTextToDocument("Úvodný **tučný** text a [odkaz](https://psipedia.sk).");
const takeaway = legacyRichTextToDocument("Dôležité upozornenie.");

function fixture() {
  return {
    introRichText: intro,
    takeawayRichText: takeaway,
    takeaway: "Dôležité upozornenie.",
    promoUtcDay: "2026-11-22",
    blocks: [
      { id: "text-1", type: "text", content: "Prvý odsek s **formátovaním**." },
      { id: "h-2", type: "h2", text: "Druhá kapitola" },
      { id: "h-3", type: "h3", text: "Podkapitola" },
      { id: "photo", type: "image", url: "/media/photo.webp", imageKey: "key/photo", alt: "Pes", caption: "Fotografia", credit: "Autor", size: "wide" },
      { id: "gallery", type: "gallery", images: [{ url: "/media/a.webp", imageKey: "gallery/a", alt: "A" }, { url: "/media/b.webp", imageKey: "gallery/b", alt: "B" }] },
      { id: "bullets", type: "bullet-list", items: ["Jedna", "Dva"] },
      { id: "steps", type: "numbered-list", items: ["Krok 1", "Krok 2"] },
      { id: "tip", type: "tip", content: "Tip z praxe" },
      { id: "warning", type: "warning", content: "Upozornenie" },
      { id: "quote", type: "quote", content: "Citácia", attribution: "Veterinár" },
      { id: "table", type: "table", headers: ["A", "B"], rows: [["1", "2"]] },
      { id: "related", type: "related", title: "Súvisiaci článok", href: "/clanky/iny", description: "Viac" },
      { id: "promo", type: "psipedia-promo", promoKey: "veterinari", variant: "auto" },
      { id: "affiliate", type: "cta", text: "Výhodný produkt", buttonText: "Pozrieť", url: "https://example.org", sponsored: true, newTab: true },
      { id: "video", type: "embed", url: "https://www.youtube.com/watch?v=2LQ2G9ZBzWc", title: "Video" },
      { id: "source-1", type: "source", label: "Odborný zdroj", url: "https://example.org/study", accessedAt: "2026-11-22", note: "Poznámka" },
    ],
  };
}

test("CONTINUOUS STEP 1: one Tiptap doc contains intro, takeaway, native headings and all custom blocks", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const doc = articleToContinuousReadOnlyDocument(input);
  assert.equal(doc.type, "doc");
  assert.equal(doc.content[0]?.type, "paragraph");
  assert.equal(doc.content[0]?.attrs?.sourceField, "intro");
  assert.equal(doc.content[1]?.attrs?.kind, "takeaway");
  assert.deepEqual(doc.content.filter(node => node.type === "heading").map(node => node.attrs?.sourceBlockId), ["h-2", "h-3"]);
  assert.deepEqual(doc.content.filter(node => node.type === "psipediaArticleWidget" && node.attrs?.kind === "block").map(node => node.attrs?.block?.id), [
    "photo", "gallery", "bullets", "steps", "tip", "warning", "quote", "table", "related", "promo", "affiliate", "video",
  ]);
  assert.equal(doc.content.find(node => node.attrs?.sourceBlockId === "text-1")?.type, "paragraph");
  assert.deepEqual(doc.content.at(-1)?.attrs?.blocks, [input.blocks.at(-1)]);
  assert.equal(doc.content.at(-1)?.attrs?.sourceHeading, "Odborné zdroje");
  assert.equal(doc.content.find(node => node.attrs?.sourceBlockId === "h-2")?.attrs?.sourceBlock, input.blocks[1]);
  assert.equal(JSON.stringify(input), before, "read-only conversion must not mutate source blocks");
});

test("CONTINUOUS STEP 1: manual source chapter retains public deduplication and additional sources at the end", () => {
  const input = fixture();
  input.blocks.push({ id: "manual-title", type: "h2", text: "Odborné zdroje" });
  input.blocks.push({ id: "manual-link", type: "bullet-list", items: ["https://example.org/study"] });
  input.blocks.push({ id: "source-2", type: "source", label: "Iný zdroj", url: "https://example.org/other" });
  const doc = articleToContinuousReadOnlyDocument(input);
  assert.equal(doc.content.at(-1)?.attrs?.kind, "sources");
  assert.deepEqual(doc.content.at(-1)?.attrs?.blocks.map(block => block.id), ["source-2"]);
  assert.equal(doc.content.at(-1)?.attrs?.sourceHeading, "Ďalšie odborné zdroje");
  assert.equal(input.blocks.filter(block => block.type === "source").length, 2, "preview must not modify stored source records");
});

test("CONTINUOUS STEP 1: empty prose blocks retain identity, unsupported kinds fail explicitly", () => {
  const input = fixture();
  input.blocks = [{ id: "empty-1", type: "text", content: "" }];
  const doc = articleToContinuousReadOnlyDocument(input);
  assert.equal(doc.content.at(-1)?.type, "paragraph");
  assert.equal(doc.content.at(-1)?.attrs?.sourceBlockId, "empty-1");
  input.blocks.push({ id: "unknown", type: "custom-future-block", payload: "Keep my content" });
  assert.throws(() => articleToContinuousReadOnlyDocument(input), /Nepodporovaný typ bloku/);
  assert.equal(input.blocks.at(-1).payload, "Keep my content");
});

test("CONTINUOUS STEP 1: UI is opt-in and cannot save a new article document", () => {
  const admin = readFileSync("components/admin-article-editor.tsx", "utf8");
  const viewer = readFileSync("components/admin-article-continuous-readonly.tsx", "utf8");
  const adapter = readFileSync("lib/article-continuous-readonly.ts", "utf8");
  assert.match(admin, /data-article-continuous-toggle/);
  assert.match(admin, /!continuousReadOnlyOpen && !continuousEditableOpen/);
  assert.match(admin, /<AdminArticleBlockEditor/);
  assert.match(viewer, /editable: false/);
  assert.match(viewer, /ReactNodeViewRenderer\(ReadOnlyWidget\)/);
  assert.match(viewer, /ArticleBlocks blocks=\{\[block\]\}/);
  assert.doesNotMatch(viewer + adapter, /updateManagedArticle|saveManagedArticle|fetch\(|\.post\(|blocks_json\s*=/);
});
