import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articlePromoGlobalFallback,
  articlePromoNewsCategoryCandidates,
  articlePromoSectionFallbacks,
  articlePromoSubsectionCandidates,
  articlePromoSubsectionSectionFallbacks,
  articlePromoTopicRules,
  resolveContextualArticlePromo,
} from "../lib/article-promo-context.ts";
import { articlePromoRegistry } from "../lib/article-promo.ts";
import { selectInitialPopularityWindow } from "../lib/article-discovery.ts";
import { portalSections } from "../lib/portal.ts";

const discoverySource = readFileSync("lib/article-discovery.ts", "utf8");
const detailSource = readFileSync("components/article-detail.tsx", "utf8");
const detailStyles = readFileSync("components/article-detail.module.css", "utf8");
const popularityComponent = readFileSync("components/article-popularity-sidebar.tsx", "utf8");
const magazineSource = readFileSync("lib/article-magazine.ts", "utf8");
const selectionSource = readFileSync("lib/article-magazine-selection.ts", "utf8");
const canonicalRoute = readFileSync("app/[section]/[slug]/page.tsx", "utf8");
const legacyRoute = readFileSync("app/clanky/[slug]/page.tsx", "utf8");

function articleFixture(overrides = {}) {
  return {
    slug: "context-test",
    portalSection: "starostlivost",
    portalSubpage: "zdravie",
    blocks: [],
    topics: [],
    ...overrides,
  };
}

function topic(label, slug = label.toLowerCase().replace(/\s+/g, "-")) {
  return {
    label,
    slug,
    normalizedKey: label.toLowerCase(),
  };
}

test("ARTICLE-DISCOVERY-2 contextual promo respects topic > subsection > section > global precedence", () => {
  const topicDecision = resolveContextualArticlePromo(articleFixture({
    portalSubpage: "srst-a-hygiena",
    topics: [topic("Dentálna hygiena", "dentalna-hygiena")],
  }), { utcDay: "2026-10-01" });
  assert.equal(topicDecision.source, "topic");
  assert.equal(topicDecision.promoKey, "veterinari");

  const subsectionDecision = resolveContextualArticlePromo(articleFixture({
    portalSection: "steniatka",
    portalSubpage: "socializacia",
    topics: [topic("Úplne neznáma téma", "uplne-neznama-tema")],
  }), { utcDay: "2026-10-01" });
  assert.equal(subsectionDecision.source, "subsection");
  assert.deepEqual(subsectionDecision.candidates, ["treneri", "kynologicke-kluby"]);

  const sectionDecision = resolveContextualArticlePromo(articleFixture({
    portalSection: "starostlivost",
    portalSubpage: "buduca-podsekcia",
  }), { utcDay: "2026-10-01" });
  assert.equal(sectionDecision.source, "section");
  assert.equal(sectionDecision.promoKey, "veterinari");

  const globalDecision = resolveContextualArticlePromo(articleFixture({
    portalSection: "buduca-sekcia",
    portalSubpage: "buduca-podsekcia",
  }), { utcDay: "2026-10-01" });
  assert.equal(globalDecision.source, "global");
  assert.equal(globalDecision.promoKey, "mapa");
});

test("ARTICLE-DISCOVERY-2 topic mapping handles one and multiple explicit topics without public topic UI", () => {
  const training = resolveContextualArticlePromo(articleFixture({
    portalSection: "aktivity",
    portalSubpage: "trening",
    topics: [topic("Privolanie")],
  }), { utcDay: "2026-10-01" });
  assert.equal(training.source, "topic");
  assert.deepEqual(training.candidates, ["treneri", "kynologicke-kluby"]);

  const multi = resolveContextualArticlePromo(articleFixture({
    portalSection: "novinky",
    newsCategory: "zo-sveta",
    topics: [topic("Adopcia"), topic("Zuby")],
  }), { utcDay: "2026-10-01" });
  assert.equal(multi.source, "topic");
  assert.ok(multi.candidates.includes("adopcia"));
  assert.ok(multi.candidates.includes("utulky"));
  assert.ok(multi.candidates.includes("veterinari"));

  assert.doesNotMatch(detailSource, /article\.topics.*chip|topic-chip|\/tema\/\$\{.*topic/i);
});

test("ARTICLE-DISCOVERY-2 news categories use contextual mappings before the news section fallback", () => {
  const decision = resolveContextualArticlePromo(articleFixture({
    portalSection: "novinky",
    portalSubpage: "veda-a-zdravie",
    newsCategory: "veda-a-zdravie",
  }), { utcDay: "2026-10-01" });
  assert.equal(decision.source, "subsection");
  assert.deepEqual(decision.candidates, ["veterinari", "recenzie"]);
});

test("ARTICLE-DISCOVERY-2 target selection is stable per UTC day and rotates deterministically", () => {
  const fixture = articleFixture({
    portalSection: "aktivity",
    portalSubpage: "trening",
  });
  const first = resolveContextualArticlePromo(fixture, { utcDay: "2026-10-01" });
  const refresh = resolveContextualArticlePromo(fixture, { utcDay: "2026-10-01" });
  const nextDay = resolveContextualArticlePromo(fixture, { utcDay: "2026-10-02" });

  assert.equal(first.promoKey, refresh.promoKey);
  assert.equal(first.seed, refresh.seed);
  assert.notEqual(first.promoKey, nextDay.promoKey);
});

test("ARTICLE-DISCOVERY-2 avoids an obvious duplicate manual promo when a contextual alternative exists", () => {
  const decision = resolveContextualArticlePromo(articleFixture({
    portalSection: "starostlivost",
    portalSubpage: "zdravie",
    blocks: [
      { id: "manual-vet", type: "psipedia-promo", promoKey: "veterinari", variant: "auto" },
    ],
  }), { utcDay: "2026-10-01" });

  assert.deepEqual(decision.candidates, ["veterinari", "fyzioterapia"]);
  assert.equal(decision.promoKey, "fyzioterapia");
});

test("ARTICLE-DISCOVERY-2 every configured contextual target exists in the canonical promo registry", () => {
  const registryKeys = new Set(Object.keys(articlePromoRegistry));
  const configured = [
    ...articlePromoTopicRules.flatMap((rule) => rule.candidates),
    ...Object.values(articlePromoSubsectionCandidates).flat(),
    ...Object.values(articlePromoNewsCategoryCandidates).flat(),
    ...Object.values(articlePromoSectionFallbacks).flat(),
    ...articlePromoGlobalFallback,
  ];
  for (const key of configured) assert.ok(registryKeys.has(key), `Unknown contextual promo key: ${key}`);
});

test("ARTICLE-DISCOVERY-2 current article-enabled subsections are explicitly mapped or deliberately delegated", () => {
  const delegated = new Set(articlePromoSubsectionSectionFallbacks);
  for (const section of portalSections.filter((item) => item.articleEnabled)) {
    for (const subpage of section.subpages.filter((item) => !item.href)) {
      if (section.slug === "novinky") {
        assert.ok(
          Object.prototype.hasOwnProperty.call(articlePromoNewsCategoryCandidates, subpage.slug),
          `News category ${subpage.slug} needs contextual promo review`,
        );
        continue;
      }
      const key = `${section.slug}/${subpage.slug}`;
      assert.ok(
        Object.prototype.hasOwnProperty.call(articlePromoSubsectionCandidates, key) || delegated.has(key),
        `Article subsection ${key} needs contextual promo review`,
      );
    }
  }
});

test("ARTICLE-DISCOVERY-2 popularity empty-state chooses 24h first, then 7d, without fake fallback", () => {
  const item = { slug: "popular", title: "Popular", href: "/clanky/popular", label: "Zdravie" };
  assert.equal(selectInitialPopularityWindow([item], [item]), "24h");
  assert.equal(selectInitialPopularityWindow([], [item]), "7d");
  assert.equal(selectInitialPopularityWindow([], []), "24h");

  assert.match(discoverySource, /readPopularityWindow\(article\.slug, "24h", now\)/);
  assert.match(discoverySource, /readPopularityWindow\(article\.slug, "7d", now\)/);
  assert.match(discoverySource, /limit:\s*5/);
  assert.match(discoverySource, /excludeSlug:\s*articleSlug/);
  assert.doesNotMatch(discoverySource, /latest|related/i);
});

test("ARTICLE-DISCOVERY-2 popularity toggle is client-only, capped at five and keyboard accessible", () => {
  assert.match(popularityComponent, /"use client"/);
  assert.match(popularityComponent, /role="tablist"/);
  assert.match(popularityComponent, /role="tab"/);
  assert.match(popularityComponent, /aria-selected=\{selected\}/);
  assert.match(popularityComponent, /ArrowLeft/);
  assert.match(popularityComponent, /ArrowRight/);
  assert.match(popularityComponent, /popularity\[activeWindow\]\.slice\(0, 5\)/);
  assert.match(popularityComponent, /24 hodín/);
  assert.match(popularityComponent, /7 dní/);
  assert.doesNotMatch(popularityComponent, /fetch\(|axios|\/api\//);
});

test("ARTICLE-DISCOVERY-2 public routes fetch discovery server-side and legacy sidebar modes are gone", () => {
  for (const route of [canonicalRoute, legacyRoute]) {
    assert.match(route, /getArticleDiscoveryData\(storedArticle\)/);
    assert.match(route, /discovery=\{discovery\}/);
  }

  assert.match(detailSource, /data-article-discovery-sidebar/);
  assert.match(detailSource, /<ArticlePopularitySidebar/);
  assert.match(detailSource, /data-automatic-article-promo/);
  assert.match(detailSource, /<ArticlePromo/);
  assert.doesNotMatch(detailSource, /Najnovšie články|sidebarMode|sidebarItems/);
  assert.doesNotMatch(magazineSource, /ArticleSidebarMode|sidebarMode|sidebarItems|latestCandidates|selectLatestSidebar/);
  assert.doesNotMatch(selectionSource, /selectLatestSidebar/);
});

test("ARTICLE-DISCOVERY-2 keeps automatic discovery sidebar hidden on mobile while end recommendations remain", () => {
  assert.match(detailStyles, /@media \(max-width: 767px\)[\s\S]*?\.sidebar\s*\{\s*display:\s*none;/);
  assert.match(detailSource, /Pokračovať v čítaní/);
  assert.match(detailSource, /Ďalšie články k téme/);
  assert.match(detailSource, /<ArticleBlocks blocks=\{contentBlocks\} promoUtcDay=\{discovery\.utcDay\} \/>/);
});
