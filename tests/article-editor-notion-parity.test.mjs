import assert from "node:assert/strict";
import "./article-update-concurrency.test.mjs";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preservedEditorArticleMetadata } from "../components/admin-article-editor-preserve.ts";
import { orphanedArticleMediaKeys } from "../lib/article-media-key-preservation.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-article-editor.tsx");
const api = read("app/api/admin/articles/[id]/route.ts");
const store = read("lib/article-store.ts");
const notionSync = read("lib/notion-article-sync.ts");

const legacyArticle = {
  portalSection: "starostlivost",
  portalSubpage: "vyziva",
  image: "/media/articles/notion-hero.webp",
  imageDisplay: "cover",
  imageFocusX: 21,
  imageFocusY: 73,
  sections: [{ heading: "Starší obsah", paragraphs: ["Nestratiť tento odsek."], bullets: ["Bod"], tip: "Tip" }],
  sources: [{ label: "Zdroj", url: "https://example.org/source", accessedAt: "2026-10-01" }],
};

test("ARTICLE-EDITOR-NOTION-PARITY-1 existing/legacy article: untouched hidden fields round-trip", () => {
  const original = structuredClone(legacyArticle);
  const result = preservedEditorArticleMetadata(original, {
    portalSection: "starostlivost", portalSubpage: null, imageUrl: original.image,
  });
  assert.equal(result.portalSubpage, "vyziva");
  assert.equal(result.imageDisplay, "cover");
  assert.equal(result.imageFocusX, 21);
  assert.equal(result.imageFocusY, 73);
  assert.deepEqual(result.sections, original.sections);
  assert.deepEqual(result.sources, original.sources);
  assert.deepEqual(original, legacyArticle);
});

test("ARTICLE-EDITOR-NOTION-PARITY-1 imported article: blocks, image, SEO and topics remain editor-owned", () => {
  const imported = {
    ...legacyArticle,
    portalSection: "aktivity",
    portalSubpage: "trening",
    image: "/media/articles/imported.webp",
    imageDisplay: "auto",
    imageFocusX: null,
    imageFocusY: null,
    sections: [],
    sources: [],
    blocks: [
      { id: "notion-abc", type: "h2", text: "Výcvik" },
      { id: "notion-photo", type: "image", url: "https://example.org/dog.webp", alt: "Pes" },
    ],
    seo: { title: "SEO názov", description: "Popis", ogTitle: "OG", focusKeyword: "tréning" },
    relatedBreedIds: [17],
    topics: [{ id: 11, name: "Výcvik" }],
  };
  const result = preservedEditorArticleMetadata(imported, {
    portalSection: imported.portalSection, portalSubpage: imported.portalSubpage, imageUrl: imported.image,
  });
  assert.equal(result.portalSubpage, "trening");
  assert.equal(result.imageDisplay, "auto");
  assert.deepEqual(result.sources, []);
  assert.deepEqual(imported.blocks.map((b) => b.id), ["notion-abc", "notion-photo"]);
  assert.equal(imported.seo.focusKeyword, "tréning");
  assert.deepEqual(imported.relatedBreedIds, [17]);
  assert.match(editor, /article\?\.blocks\?\.length/);
  assert.match(editor, /onNavigateBlock=\{\(blockId\) => navigatePreview\(blockId\)\}/);
  assert.match(editor, /introRichText,/);
  assert.match(editor, /focusKeyword,/);
  assert.match(editor, /topicIds,/);
  assert.match(editor, /relatedBreedIds,/);
});

test("ARTICLE-EDITOR-NOTION-PARITY-1 minimal draft defaults and changed picture/section reset correctly", () => {
  assert.deepEqual(preservedEditorArticleMetadata(undefined, {
    portalSection: "clanky", portalSubpage: null, imageUrl: null,
  }), { portalSubpage: null, sections: [], sources: [], imageDisplay: "auto", imageFocusX: null, imageFocusY: null });

  const changedImage = preservedEditorArticleMetadata(legacyArticle, {
    portalSection: "starostlivost", portalSubpage: "vyziva", imageUrl: "/media/articles/replaced.webp",
  });
  assert.equal(changedImage.imageDisplay, "auto");
  assert.equal(changedImage.imageFocusX, null);
  assert.equal(changedImage.imageFocusY, null);
  assert.deepEqual(changedImage.sources, legacyArticle.sources);

  const changedSection = preservedEditorArticleMetadata(legacyArticle, {
    portalSection: "clanky", portalSubpage: null, imageUrl: legacyArticle.image,
  });
  assert.equal(changedSection.portalSubpage, null);
});

test("ARTICLE-EDITOR-NOTION-PARITY-1 normal draft save cannot change published or scheduled state implicitly", () => {
  assert.match(editor, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void save\(displayedStatus\); \}\}/);
  assert.match(editor, /displayedStatus === "published" \? "Uložiť zmeny"/);
  assert.match(editor, /displayedStatus === "scheduled" \? "Uložiť plánovaný článok"/);
  assert.match(editor, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.match(editor, /onClick=\{\(\) => void save\("scheduled"\)\}/);
  assert.match(editor, /data-article-current-status/);
  assert.match(editor, /ArticleEditorCalendar/);
  assert.match(editor, /setPreviewOpen/);
  assert.match(editor, /onNavigateBlock/);
});

test("ARTICLE-EDITOR-NOTION-PARITY-1 update rejects stale imports and preserves omitted values", () => {
  assert.match(editor, /lastSavedUpdatedAtRef\.current = data\.article\.updatedAt/);
  assert.match(editor, /expectedUpdatedAt: lastSavedUpdatedAtRef\.current/);
  assert.match(api, /payload\.expectedUpdatedAt !== before\.updatedAt/);
  assert.match(api, /status: 409/);
  for (const field of ["sections", "sources", "imageDisplay", "imageFocusX", "imageFocusY"]) {
    assert.ok(api.includes("payload." + field + " === undefined ? before." + field), field);
  }
  assert.match(api, /payload\.portalSubpage === undefined && payload\.portalSection === before\.portalSection/);
  assert.match(api, /writeBackPublishedArticleToNotion/);
  assert.match(store, /normalizeArticleBlocks\(payload\.blocks \?\? \[\]\)/);
  assert.match(notionSync, /status: "draft"/);
  assert.match(notionSync, /"Sync stav": \{ select: \{ name: "Synchronizované" \} \}/);
});

test("ARTICLE-EDITOR-NOTION-PARITY-1 rich block/photo/SEO payload is not replaced with a second draft", () => {
  assert.match(editor, /sections: preservedMetadata\.sections/);
  assert.match(editor, /sources: preservedMetadata\.sources/);
  assert.match(editor, /portalSubpage: preservedMetadata\.portalSubpage/);
  assert.match(editor, /imageDisplay: preservedMetadata\.imageDisplay/);
  assert.match(editor, /thumbnailImageDisplay,/);
  assert.match(editor, /detailImageDisplay,/);
  assert.match(editor, /canonicalUrl,/);
  assert.match(editor, /noindex,/);
  assert.match(editor, /ogTitle,/);
  assert.match(editor, /ogDescription,/);
  assert.match(editor, /ogImageKey:/);
  assert.match(editor, /method: article \? "PUT" : "POST"/);
  assert.match(editor, /originalAreaHidden && <option/);
  assert.doesNotMatch(editor, /onSubmit=\{[^\n]*void save\("published"\)/);
});


test("ARTICLE-EDITOR-NOTION-PARITY-1 shared Notion hero/OG R2 key is never deleted while referenced", () => {
  const old = "articles/2026/notion-shared.webp";
  const freshHero = "articles/2026/replacement.webp";
  const freshOg = "articles/2026/og-new.webp";
  const block = "articles/2026/inline.webp";

  assert.deepEqual(orphanedArticleMediaKeys([old, old], [freshHero, old]), []);
  assert.deepEqual(orphanedArticleMediaKeys([old, old], [old, freshOg]), []);
  assert.deepEqual(orphanedArticleMediaKeys([old, old], [freshHero, freshOg]), [old]);
  assert.deepEqual(orphanedArticleMediaKeys([old, old, block], [old, null, block]), []);
  assert.deepEqual(orphanedArticleMediaKeys([old, old, block], [old, null]), [block]);
  assert.deepEqual(orphanedArticleMediaKeys([null, "", old, old], [null]), [old]);

  assert.match(api, /orphanedArticleMediaKeys\(/);
  assert.match(api, /\[before\.imageKey, before\.ogImageKey, \.\.\.articleBlockImageKeys/);
  assert.match(api, /\[article\.imageKey, article\.ogImageKey, \.\.\.articleBlockImageKeys/);
});
