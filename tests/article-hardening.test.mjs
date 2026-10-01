import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { preserveArticlePromoBlocks } from "../lib/article-promo.ts";
import { resolveContextualArticlePromo } from "../lib/article-promo-context.ts";

const detail = readFileSync("components/article-detail.tsx", "utf8");
const detailStyles = readFileSync("components/article-detail.module.css", "utf8");
const popularitySidebar = readFileSync("components/article-popularity-sidebar.tsx", "utf8");
const popularityStyles = readFileSync("components/article-popularity-sidebar.module.css", "utf8");
const blocksRenderer = readFileSync("components/article-blocks.tsx", "utf8");
const magazine = readFileSync("lib/article-magazine.ts", "utf8");
const store = readFileSync("lib/article-store.ts", "utf8");
const notionSync = readFileSync("lib/notion-article-sync.ts", "utf8");

function articleFixture(overrides = {}) {
  return {
    slug: "hardening-article",
    portalSection: "starostlivost",
    portalSubpage: "zdravie",
    blocks: [],
    topics: [],
    ...overrides,
  };
}

function topic(label, overrides = {}) {
  return {
    label,
    slug: label.toLocaleLowerCase("sk").replace(/\s+/g, "-"),
    normalizedKey: label.toLocaleLowerCase("sk"),
    isActive: true,
    ...overrides,
  };
}

test("ARTICLE-HARDENING keeps the migration chain capped at the approved 0105 article migration", () => {
  const migrations = readdirSync("drizzle")
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assert.ok(migrations.includes("0104_article_topics.sql"));
  assert.ok(migrations.includes("0105_article_popularity.sql"));
  assert.equal(migrations.some((name) => name.startsWith("0106_")), false);
  assert.equal(migrations.at(-1), "0105_article_popularity.sql");
});

test("contextual promo descends the existing hierarchy instead of duplicating a manual target", () => {
  const decision = resolveContextualArticlePromo(articleFixture({
    topics: [topic("Dentálna hygiena")],
    blocks: [
      { id: "manual-vet", type: "psipedia-promo", promoKey: "veterinari", variant: "auto" },
    ],
  }), { utcDay: "2026-10-01" });

  assert.ok(decision);
  assert.equal(decision.source, "subsection");
  assert.equal(decision.promoKey, "fyzioterapia");
});

test("contextual promo suppresses the automatic card when every contextual fallback is already manual", () => {
  const decision = resolveContextualArticlePromo(articleFixture({
    portalSection: "clanky",
    portalSubpage: undefined,
    blocks: [
      { id: "manual-map", type: "psipedia-promo", promoKey: "mapa", variant: "v1" },
    ],
  }), { utcDay: "2026-10-01" });

  assert.equal(decision, null);
  assert.match(detail, /showDiscoverySidebar = hasPopularity \|\| Boolean\(discovery\.promo\)/);
  assert.match(detail, /\{discovery\.promo \? \(/);
});

test("inactive article topics do not override the active subsection promo context", () => {
  const decision = resolveContextualArticlePromo(articleFixture({
    portalSubpage: "srst-a-hygiena",
    topics: [topic("Dentálna hygiena", { isActive: false })],
  }), { utcDay: "2026-10-01" });

  assert.ok(decision);
  assert.equal(decision.source, "subsection");
  assert.ok(decision.candidates.includes("salony"));
});

test("public manual and automatic promo share the server-resolved UTC day", () => {
  assert.match(detail, /promoUtcDay=\{discovery\.utcDay\}/);
  assert.match(detail, /utcDay=\{discovery\.utcDay\}/);
  assert.match(blocksRenderer, /utcDay=\{promoUtcDay\}/);
});

test("secondary article recommendation reads are fail-soft and no dead mid-related presentation remains", () => {
  assert.match(magazine, /manual related read failed/);
  assert.match(magazine, /topic candidates read failed/);
  assert.match(magazine, /end recommendations read failed/);
  assert.doesNotMatch(magazine, /sameArticleTopic/);
  assert.doesNotMatch(detailStyles, /midRelated/);
});

test("long titles, links, source labels and popularity items cannot force page-level horizontal overflow", () => {
  assert.match(detailStyles, /\.title h1[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(detailStyles, /\.title > p[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(detailStyles, /article-blocks a\)[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(detailStyles, /article-block-sources li\)[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(popularityStyles, /\.list a[\s\S]*?min-width:\s*0/);
  assert.match(popularityStyles, /\.list strong[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("popularity toggle stays client-local and the qualified-read tracker has exactly one article mount", () => {
  assert.doesNotMatch(popularitySidebar, /fetch\(|axios|\/api\//);
  assert.match(popularitySidebar, /role="tablist"/);
  assert.match(popularitySidebar, /aria-selected=\{selected\}/);
  assert.match(popularitySidebar, /ArrowLeft/);
  assert.match(popularitySidebar, /ArrowRight/);
  assert.equal((detail.match(/<ArticleReadTracker\b/g) ?? []).length, 1);
});

test("Notion preservation keeps promo order while article updates without topicIds keep manual topics", () => {
  const existing = [
    { id: "notion-a", type: "text" },
    { id: "promo-a", type: "psipedia-promo" },
    { id: "promo-b", type: "psipedia-promo" },
    { id: "notion-b", type: "h2" },
  ];
  const next = [{ id: "notion-b", type: "h2" }];
  assert.deepEqual(preserveArticlePromoBlocks(existing, next).map((block) => block.id), [
    "promo-a",
    "promo-b",
    "notion-b",
  ]);

  assert.match(notionSync, /preserveArticlePromoBlocks/);
  assert.doesNotMatch(notionSync, /topicIds\s*:/);
  assert.match(store, /payload\.topicIds === undefined \? undefined/);
  assert.match(store, /topicIds === undefined \? existing\.topics/);
});

test("hardening does not expose article topics or alter the established SEO article schema contract", () => {
  assert.doesNotMatch(detail, /article\.topics.*chip|topic-chip|\/tema\/\$\{.*topic/i);
  assert.match(detail, /"@type": section === "novinky" \? "NewsArticle" : "Article"/);
  assert.match(detail, /articleSection: topicLabel/);
  assert.match(detail, /datePublished: article\.dateIso/);
  assert.match(detail, /dateModified: article\.updatedDateIso/);
  assert.match(detail, /wordCount/);
  assert.doesNotMatch(detail, /keywords:[^\n]*article\.topics/);
});
