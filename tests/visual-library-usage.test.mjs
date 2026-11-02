import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "cloudflare:workers";
import { articlePromoBlockAnchor, AUTOMATIC_ARTICLE_PROMO_ANCHOR } from "../lib/visual-library-anchors.ts";
import {
  collectPublishedArticleBannerUses,
  loadPublishedArticleBannerUses,
} from "../lib/visual-library-usage-store.ts";

const makeRow = (id, slug, blocks = [], extras = {}) => ({
  id, slug, title: `Publikovaný článok ${id}`,
  portal_section: "starostlivost", portal_subpage: null,
  news_category: null, blocks_json: JSON.stringify(blocks), ...extras,
});

test("stage 2: real canonical URL, manual occurrences and contextual promo are distinguished", () => {
  const articles = [
    makeRow(1, "zdrave-labky", [
      { id: "one", type: "psipedia-promo", promoKey: "veterinari", variant: "v1" },
      { id: "other", type: "text", content: "Text" },
      { id: "two", type: "psipedia-promo", promoKey: "veterinari", variant: "v2" },
    ]),
    makeRow(2, "veterinar-v-okoli"),
    makeRow(3, "draft-error", [], { blocks_json: "{not json}" }),
  ];
  const { byKey, malformed } = collectPublishedArticleBannerUses(articles, [], "2026-10-31");
  assert.equal(malformed, 1);
  const vets = byKey.veterinari;
  assert.equal(vets.length, 3);
  assert.deepEqual(vets.filter((item) => item.evidence === "published-manual").map((item) => item.blockId), ["one", "two"]);
  assert.deepEqual(vets.filter((item) => item.evidence === "published-manual").map((item) => item.anchorId), [articlePromoBlockAnchor("one"), articlePromoBlockAnchor("two")]);
  assert.equal(vets.find((item) => item.evidence === "published-auto-today").anchorId, AUTOMATIC_ARTICLE_PROMO_ANCHOR);
  assert.equal(vets.filter((item) => item.evidence === "published-auto-today").length, 1);
  assert.deepEqual(new Set(vets.map((item) => item.url)), new Set([
    "https://psipedia.sk/starostlivost/zdrave-labky",
    "https://psipedia.sk/starostlivost/veterinar-v-okoli",
  ]));
  assert.equal(vets.some((item) => item.placement.includes("obsahu")), true);
});

test("stage 2: topic-based editorial selection uses actual article topics, not guessed slugs", () => {
  const row = makeRow(10, "pes-a-zuby", [], { portal_section: "aktivity" });
  const topics = [{ article_id: 10, slug: "zuby", label: "Zuby", normalized_key: "zuby", is_active: 1 }];
  const { byKey } = collectPublishedArticleBannerUses([row], topics, "2026-10-31");
  assert.equal(byKey.veterinari?.[0]?.url, "https://psipedia.sk/aktivity/pes-a-zuby");
});

test("stage 2: missing database fails closed rather than showing an invented empty result", async () => {
  const old = env.DB;
  env.DB = undefined;
  try {
    const result = await loadPublishedArticleBannerUses();
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.byKey, {});
    assert.ok(result.notice);
  } finally {
    env.DB = old;
  }
});

test("stage 2: reader filters published records in SQL and reports incomplete coverage honestly", async () => {
  const old = env.DB;
  const queries = [];
  env.DB = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind() {
          return {
            async all() {
              if (sql.includes("FROM managed_articles\n")) {
                return { results: [makeRow(5, "bezpecny-clanok")] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
  try {
    const result = await loadPublishedArticleBannerUses();
    assert.equal(result.status, "complete");
    assert.equal(result.scannedArticles, 1);
    assert.equal(result.byKey.veterinari?.[0]?.url, "https://psipedia.sk/starostlivost/bezpecny-clanok");
    assert.ok(queries.every((query) => query.includes("status = 'published'")));
  } finally {
    env.DB = old;
  }
});
