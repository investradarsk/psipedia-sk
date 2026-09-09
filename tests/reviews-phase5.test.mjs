import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 5 review hub uses managed canonical category navigation and surfaces content first", () => {
  const hub = read("components/portal-hub.tsx");
  assert.match(hub, /const isReviews = section\.slug === "recenzie"/);
  assert.match(hub, /const showSectionTabs = isEditorialHub \|\| isReviews/);
  assert.match(hub, /showSectionTabs && <PortalSectionTabs section=\{section\}/);
  assert.match(hub, /showSectionTabs && latestContent/);
  assert.match(hub, /!isReviews && <section className="section shell portal-directory"/);
  assert.match(hub, /subpages\.find\(\(item\) => item\.slug === article\.portalSubpage\)/);
  assert.match(hub, /portalSubpageHref\(section, category\)/);
  assert.match(hub, /actionLabel: "Čítať recenziu"/);
  assert.doesNotMatch(hub, /Krmivá|Maškrty|GPS lokátory|Pelechy/);
});

test("Phase 5 review category pages are direct filtered listings, not generic intermediary pages", () => {
  const topic = read("components/portal-topic.tsx");
  assert.match(topic, /const isReviews = section\.slug === "recenzie"/);
  assert.match(topic, /section\.slug !== "recenzie" \|\| article\.portalSubpage === subpage\.slug/);
  assert.match(topic, /showSectionTabs && <PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/);
  assert.match(topic, /!isReviews && <section className="section shell portal-topic-body"/);
  assert.match(topic, /hasReviewGuide && <section className="section shell portal-topic-body review-topic-guide"/);
  assert.match(topic, /Recenzie v kategórii/);
  assert.match(topic, /Všetky recenzie/);
});

test("valuable managed review landing content is preserved without treating labels or SEO metadata as value", () => {
  const reviews = read("lib/reviews.ts");
  const topic = read("components/portal-topic.tsx");
  const helper = reviews;
  assert.match(helper, /export function portalSubpageHasEditorialValue/);
  assert.match(helper, /subpage\.intro/);
  assert.match(helper, /subpage\.popularTopics\?\.length/);
  assert.match(helper, /subpage\.commonQuestions\?\.length/);
  assert.match(helper, /subpage\.homeSteps\?\.length/);
  assert.match(helper, /subpage\.warningSigns\?\.length/);
  assert.match(helper, /subpage\.expertAdvice/);
  assert.match(helper, /subpage\.serviceLinks\?\.length/);
  assert.doesNotMatch(helper, /seoTitle|metaDescription|\.label|\.description|featuredArticleSlugs|imageUrl|imageAlt/);
  assert.match(topic, /Metodika a kontext/);
  assert.match(topic, /Súvisiace odkazy/);
});

test("shared article cards can show review category metadata without a second card system", () => {
  const card = read("components/article-card.tsx");
  assert.match(card, /topicHref: topicHrefOverride/);
  assert.match(card, /topicLabel: topicLabelOverride/);
  assert.match(card, /actionLabel/);
  assert.match(card, /const topicHref = topicHrefOverride \?\?/);
  assert.match(card, /const topicLabel = topicLabelOverride \?\?/);
  assert.match(card, /resolvedActionLabel/);
  assert.equal((card.match(/export function ArticleCard/g) ?? []).length, 1);
});

test("review detail uses the managed product category in breadcrumbs and structured data", () => {
  const detail = read("components/article-detail.tsx");
  const route = read("app/[section]/[slug]/page.tsx");
  assert.match(detail, /section === "recenzie" && portalSection\?\.slug === "recenzie"/);
  assert.match(detail, /portalSubpageHref\(portalSection!, reviewCategory\)/);
  assert.match(detail, /articleSection: topicLabel/);
  assert.match(detail, /name: topicLabel, item: `\$\{SITE_URL\}\$\{topicHref\}`/);
  assert.match(route, /portalSection=\{section === "recenzie" \? managedSection : undefined\}/);
});

test("empty thin review categories are noindex and excluded from sitemap until they have value", () => {
  const route = read("app/[section]/[slug]/page.tsx");
  const sitemap = read("app/sitemap.ts");
  assert.match(route, /section === "recenzie" && !portalSubpageHasEditorialValue\(portalTopic\.subpage\)/);
  assert.match(route, /getPublishedReviewSummaries\(slug, 1\)/);
  assert.match(route, /if \(!reviews\.length\)/);
  assert.match(route, /robots: \{ index: false, follow: true \}/);
  assert.match(sitemap, /section\.slug !== "recenzie"/);
  assert.match(sitemap, /portalSubpageHasEditorialValue\(subpage\) \|\| sectionArticles\.some\(\(article\) => article\.portalSubpage === subpage\.slug\)/);
});

test("review category landing content and SEO are manageable in the existing section admin", () => {
  const editor = read("components/admin-section-editor.tsx");
  assert.match(editor, /const isReviewSection = section\.slug === "recenzie"/);
  assert.match(editor, /isStructuredSection = section\.slug === "starostlivost" \|\| section\.slug === "aktivity" \|\| section\.slug === "steniatka" \|\| isReviewSection/);
  assert.match(editor, /Obsah kategórie recenzií a testov/);
  assert.match(editor, /Metodika testovania a redakčný kontext/);
  assert.match(editor, /SEO title/);
  assert.match(editor, /Meta description/);
});

test("existing admin CTA and sponsored behavior remain the review source of truth", () => {
  const editor = read("components/admin-article-block-editor.tsx");
  const renderer = read("components/article-blocks.tsx");
  assert.match(editor, /Affiliate \/ sponsored/);
  assert.match(editor, /Partnerský odkaz/);
  assert.match(renderer, /if \(!block\.buttonText \|\| !href\) return null/);
  assert.match(renderer, /sponsored nofollow/);
  assert.match(renderer, /article-block-cta-disclosure/);
});

test("review category filtering happens before the category-page slice", () => {
  const reviews = read("lib/reviews.ts");
  const route = read("app/[section]/[slug]/page.tsx");
  assert.match(reviews, /getPublishedArticleSummaries\(\{ portalSection: "recenzie", limit: 500 \}\)/);
  assert.match(reviews, /article\.portalSubpage === portalSubpage/);
  assert.ok(reviews.indexOf(".filter(") < reviews.indexOf(".slice("));
  assert.match(route, /getPublishedReviewSummaries\(slug, 120\)/);
  assert.match(route, /getPublishedReviewSummaries\(slug, 1\)/);
});

test("Phase 5 keeps non-review shared component behavior on the existing paths", () => {
  const hub = read("components/portal-hub.tsx");
  const topic = read("components/portal-topic.tsx");
  const detail = read("components/article-detail.tsx");
  assert.match(hub, /const isEditorialHub = isCare \|\| isActivities \|\| isPuppies/);
  assert.match(hub, /!showSectionTabs && latestContent/);
  assert.match(topic, /const isStructuredTopic = isCare \|\| isActivities \|\| isPuppies/);
  assert.match(topic, /section\.slug !== "steniatka" \|\| article\.portalSubpage === subpage\.slug/);
  assert.match(topic, /!isCare \|\| legacyCareArea\(article\) === subpage\.slug/);
  assert.match(topic, /!isActivities \|\| legacyActivityArea\(article\) === subpage\.slug/);
  assert.match(detail, /"Článok si môžeš uložiť v tomto zariadení a vrátiť sa k nemu neskôr\."/);
});

test("package change only wires Phase 5 regression tests and does not change dependencies", () => {
  const packageJson = read("package.json");
  assert.match(packageJson, /tests\/reviews-phase5\.test\.mjs/);
  assert.doesNotMatch(packageJson, /reviews-phase5[^"]*dependencies/);
});
