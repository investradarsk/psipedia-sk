import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  articlePromoKeys,
  articlePromoRegistry,
  preserveArticlePromoBlocks,
  resolveArticlePromo,
  selectArticlePromoVariantIndex,
} from "../lib/article-promo.ts";
import { normalizeArticleBlocks } from "../lib/article-blocks.ts";
import { assessArticleContentQa } from "../lib/article-content-qa.ts";

test("ARTICLE-PROMO registry exposes only canonical internal targets and exactly three copy variants", () => {
  const expected = [
    "veterinari",
    "treneri",
    "chovatelske-stanice",
    "chovatelske-kluby",
    "kynologicke-kluby",
    "salony",
    "fyzioterapia",
    "mapa",
    "podujatia",
    "adopcia",
    "utulky",
    "stratene-a-najdene",
    "plemena",
    "recenzie",
  ];
  assert.deepEqual(articlePromoKeys, expected);
  for (const key of articlePromoKeys) {
    const target = articlePromoRegistry[key];
    assert.match(target.href, /^\/(?!\/)/);
    assert.equal(target.variants.length, 3);
    assert.ok(target.label);
    assert.ok(target.purpose);
    assert.ok(target.ctaLabel);
  }
  assert.equal(articlePromoRegistry.veterinari.href, "/adresar/veterinari");
  assert.equal(articlePromoRegistry.treneri.href, "/adresar/treneri");
  assert.equal(articlePromoRegistry["chovatelske-stanice"].href, "/adresar/chovatelske-stanice");
  assert.equal(articlePromoRegistry["chovatelske-kluby"].href, "/adresar/chovatelske-kluby");
  assert.equal(articlePromoRegistry["kynologicke-kluby"].href, "/adresar/kynologicke-kluby");
  assert.equal(articlePromoRegistry.salony.href, "/adresar/salony-a-sluzby");
  assert.equal(articlePromoRegistry.fyzioterapia.href, "/adresar/fyzioterapia");
  assert.equal(articlePromoRegistry.mapa.href, "/mapa");
  assert.equal(articlePromoRegistry.podujatia.href, "/podujatia");
  assert.equal(articlePromoRegistry.adopcia.href, "/pomoc-psom/adopcia");
  assert.equal(articlePromoRegistry.utulky.href, "/pomoc-psom/utulky");
  assert.equal(articlePromoRegistry["stratene-a-najdene"].href, "/pomoc-psom/stratene-a-najdene");
  assert.equal(articlePromoRegistry.plemena.href, "/plemena");
  assert.equal(articlePromoRegistry.recenzie.href, "/recenzie");
});

test("ARTICLE-PROMO block normalization accepts known presets and cannot smuggle an arbitrary URL", () => {
  const [valid] = normalizeArticleBlocks([{
    id: "promo-1",
    type: "psipedia-promo",
    promoKey: "veterinari",
    variant: "v2",
    url: "https://attacker.example/",
    href: "https://attacker.example/",
  }]);
  assert.deepEqual(valid, {
    id: "promo-1",
    type: "psipedia-promo",
    promoKey: "veterinari",
    variant: "v2",
  });

  const [auto] = normalizeArticleBlocks([{
    id: "promo-auto",
    type: "psipedia-promo",
    promoKey: "mapa",
    variant: "auto",
  }]);
  assert.equal(auto?.type, "psipedia-promo");
  assert.equal(auto?.variant, "auto");

  assert.deepEqual(normalizeArticleBlocks([{
    id: "bad",
    type: "psipedia-promo",
    promoKey: "external-target",
    variant: "v1",
    url: "https://attacker.example/",
  }]), []);
});

test("ARTICLE-PROMO deterministic rotation is stable for the same seed/day and explicit variants never rotate", () => {
  const day = "2026-10-01";
  const index = selectArticlePromoVariantIndex("veterinari", "article-slug", day);
  assert.equal(selectArticlePromoVariantIndex("veterinari", "article-slug", day), index);
  assert.ok(index >= 0 && index < 3);

  const explicit = resolveArticlePromo("veterinari", "v3", "article-slug", "2030-01-01");
  const explicitLater = resolveArticlePromo("veterinari", "v3", "article-slug", "2030-01-02");
  assert.equal(explicit.variantKey, "v3");
  assert.equal(explicitLater.variantKey, "v3");
  assert.equal(explicit.copy.headline, explicitLater.copy.headline);
});

test("ARTICLE-PROMO Notion preservation keeps promo after the same stable anchor", () => {
  const existing = [
    { id: "notion-a", type: "text" },
    { id: "promo-1", type: "psipedia-promo", promoKey: "mapa", variant: "auto" },
    { id: "notion-b", type: "h2" },
  ];
  const next = [
    { id: "notion-a", type: "text" },
    { id: "notion-new", type: "text" },
    { id: "notion-b", type: "h2" },
  ];
  assert.deepEqual(preserveArticlePromoBlocks(existing, next).map((block) => block.id), [
    "notion-a", "promo-1", "notion-new", "notion-b",
  ]);
});

test("ARTICLE-PROMO Notion preservation uses the next anchor, then deterministic end fallback", () => {
  const existing = [
    { id: "notion-removed", type: "text" },
    { id: "promo-1", type: "psipedia-promo", promoKey: "mapa", variant: "auto" },
    { id: "notion-b", type: "h2" },
    { id: "promo-2", type: "psipedia-promo", promoKey: "plemena", variant: "v1" },
  ];
  const next = [
    { id: "notion-a", type: "text" },
    { id: "notion-b", type: "h2" },
  ];
  assert.deepEqual(preserveArticlePromoBlocks(existing, next).map((block) => block.id), [
    "notion-a", "promo-1", "notion-b", "promo-2",
  ]);
});

test("ARTICLE-PROMO Notion preservation appends promos in original order when both anchors disappear", () => {
  const existing = [
    { id: "notion-old-a", type: "text" },
    { id: "promo-1", type: "psipedia-promo", promoKey: "mapa", variant: "auto" },
    { id: "promo-2", type: "psipedia-promo", promoKey: "plemena", variant: "v1" },
    { id: "notion-old-b", type: "h2" },
  ];
  const next = [
    { id: "notion-new-only", type: "text" },
  ];
  assert.deepEqual(preserveArticlePromoBlocks(existing, next).map((block) => block.id), [
    "notion-new-only", "promo-1", "promo-2",
  ]);
});

test("ARTICLE-PROMO content QA accepts a valid promo block without treating it as an empty editorial block", () => {
  const blocks = normalizeArticleBlocks([{
    id: "promo-qa",
    type: "psipedia-promo",
    promoKey: "veterinari",
    variant: "auto",
  }]);
  assert.doesNotThrow(() => assessArticleContentQa({ blocks }));
  assert.equal(assessArticleContentQa({ blocks }).some((issue) => issue.code === "EMPTY_REQUIRED_BLOCK"), false);
});

test("ARTICLE-PROMO preserves multiple promo blocks in editorial order and leaves promo-free articles unchanged", () => {
  const existing = [
    { id: "notion-a", type: "text" },
    { id: "promo-1", type: "psipedia-promo" },
    { id: "promo-2", type: "psipedia-promo" },
    { id: "notion-b", type: "h2" },
  ];
  const next = [
    { id: "notion-a", type: "text" },
    { id: "notion-b", type: "h2" },
  ];
  assert.deepEqual(preserveArticlePromoBlocks(existing, next).map((block) => block.id), [
    "notion-a", "promo-1", "promo-2", "notion-b",
  ]);
  assert.deepEqual(preserveArticlePromoBlocks(next, next), next);
});

test("ARTICLE-PROMO admin/public integration exposes add, target, variant, preview, reorder and remove contracts", () => {
  const editor = readFileSync("components/admin-article-block-editor.tsx", "utf8");
  const blockModel = readFileSync("lib/article-blocks.ts", "utf8");
  const renderer = readFileSync("components/article-blocks.tsx", "utf8");
  const promoComponent = readFileSync("components/article-promo.tsx", "utf8");
  const promoCss = readFileSync("components/article-promo.module.css", "utf8");
  const store = readFileSync("lib/article-store.ts", "utf8");

  assert.match(blockModel, /"psipedia-promo": "Promo Psipedie"/);
  assert.match(editor, /articleBlockLabels/);
  assert.match(editor, /Promo cieľ/);
  assert.match(editor, /Variant/);
  assert.match(editor, /Automaticky/);
  assert.match(editor, /ArticlePromo/);
  assert.match(editor, /move\(index, -1\)/);
  assert.match(editor, /pendingDeleteId/);

  assert.match(renderer, /block\.type === "psipedia-promo"/);
  assert.match(renderer, /ArticlePromo/);
  assert.match(promoComponent, /aria-label=/);
  assert.match(promoComponent, /aria-hidden="true"/);
  assert.match(promoCss, /focus-visible/);
  assert.match(promoCss, /@media \(max-width: 640px\)/);
  assert.match(promoCss, /grid-template-columns: 1fr/);

  assert.match(store, /JSON\.stringify\(input\.blocks\)/);
  assert.match(store, /normalizeArticleBlocks\(storedBlocks\)/);
});

test("ARTICLE-PROMO Notion sync hashes source-owned content but merges manual promo before update", () => {
  const sync = readFileSync("lib/notion-article-sync.ts", "utf8");
  assert.match(sync, /preserveArticlePromoBlocks/);
  const hash = sync.indexOf("const contentHash");
  const merge = sync.indexOf("preserveArticlePromoBlocks", hash);
  const update = sync.indexOf("updateManagedArticle(existing.id", merge);
  assert.ok(hash >= 0 && merge > hash && update > merge);
  assert.match(sync, /existing\.blocks/);
});


test("ARTICLE-PROMO preservation does not duplicate Notion-owned promo blocks", () => {
  const existing = [
    { id: "notion-a", type: "text" },
    { id: "notion-manifest-blocks-1", type: "psipedia-promo", promoKey: "treneri", variant: "auto" },
    { id: "manual-promo", type: "psipedia-promo", promoKey: "mapa", variant: "v1" },
    { id: "notion-b", type: "h2" },
  ];
  const next = [
    { id: "notion-a", type: "text" },
    { id: "notion-manifest-blocks-1", type: "psipedia-promo", promoKey: "treneri", variant: "auto" },
    { id: "notion-b", type: "h2" },
  ];
  const merged = preserveArticlePromoBlocks(existing, next);
  assert.equal(merged.filter((block) => block.id === "notion-manifest-blocks-1").length, 1);
  assert.equal(merged.filter((block) => block.id === "manual-promo").length, 1);
});
