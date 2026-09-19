import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  firstManualRelatedPath,
  selectAutomaticMidRelated,
  selectEndRelated,
  selectLatestSidebar,
} from "../lib/article-magazine-selection.ts";

const detail = readFileSync("components/article-detail.tsx", "utf8");
const blocks = readFileSync("components/article-blocks.tsx", "utf8");
const styles = readFileSync("components/article-detail.module.css", "utf8");
const shareComponent = readFileSync("components/share-button.tsx", "utf8");
const shareStyles = readFileSync("components/share-button.module.css", "utf8");
const magazine = readFileSync("lib/article-magazine.ts", "utf8");
const selection = readFileSync("lib/article-magazine-selection.ts", "utf8");
const articleStore = readFileSync("lib/article-store.ts", "utf8");
const adminBlockEditor = readFileSync("components/admin-article-block-editor.tsx", "utf8");
const cookieConsent = readFileSync("components/cookie-consent.tsx", "utf8");
const legacyRoute = readFileSync("app/clanky/[slug]/page.tsx", "utf8");
const canonicalRoute = readFileSync("app/[section]/[slug]/page.tsx", "utf8");
const articleSeo = readFileSync("lib/article-seo.ts", "utf8");

function indexOfOrFail(source, value, message) {
  const index = source.indexOf(value);
  assert.notEqual(index, -1, message);
  return index;
}

function articleFixture(slug, overrides = {}) {
  return {
    slug,
    title: slug,
    category: "Zdravie",
    portalSection: "starostlivost",
    portalSubpage: "zdravie",
    blocks: [],
    ...overrides,
  };
}

test("ARTICLE-2 recommendation selectors reject self-links and keep recommendation surfaces unique", () => {
  const current = articleFixture("current");
  const sameTopic = articleFixture("same-topic");
  const wrongTopic = articleFixture("wrong-topic", { portalSubpage: "vyziva" });
  const newest = [
    articleFixture("current"),
    sameTopic,
    articleFixture("end-a"),
    articleFixture("end-b"),
    articleFixture("end-c"),
    articleFixture("latest-a"),
    articleFixture("latest-b"),
  ];

  assert.equal(selectAutomaticMidRelated(current, [current, wrongTopic, sameTopic])?.slug, "same-topic");
  assert.equal(selectAutomaticMidRelated(current, [current, wrongTopic]), null);

  const end = selectEndRelated(current, [current, sameTopic, newest[2], newest[2], newest[3], newest[4]], sameTopic, 3);
  assert.deepEqual(end.map((item) => item.slug), ["end-a", "end-b", "end-c"]);

  const sidebar = selectLatestSidebar(current, newest, sameTopic, end, 5);
  assert.deepEqual(sidebar.map((item) => item.slug), ["latest-a", "latest-b"]);
});

test("ARTICLE-2 manual related selector accepts one clean internal article path only", () => {
  const valid = articleFixture("current", { blocks: [{ id: "r1", type: "related", title: "Related", href: "/starostlivost/related" }] });
  const external = articleFixture("current", { blocks: [{ id: "r1", type: "related", title: "Related", href: "https://example.com/related" }] });
  const query = articleFixture("current", { blocks: [{ id: "r1", type: "related", title: "Related", href: "/starostlivost/related?preview=1" }] });

  assert.equal(firstManualRelatedPath(valid), "/starostlivost/related");
  assert.equal(firstManualRelatedPath(external), null);
  assert.equal(firstManualRelatedPath(query), null);
});

test("ARTICLE-2 canonical article routes share one magazine data contract", () => {
  for (const route of [legacyRoute, canonicalRoute]) {
    assert.match(route, /getArticleMagazineData/);
    assert.match(route, /<ArticleDetail article=\{article\} magazine=\{magazine\}/);
    assert.doesNotMatch(route, /getRelatedPublishedArticles\(article,\s*3\)/);
  }
  assert.match(detail, /magazine:\s*ArticleMagazineData/);
});

test("article popularity mode is truthful: GA4 exists, but the application sidebar is latest rather than fake most-read", () => {
  assert.match(cookieConsent, /MEASUREMENT_ID = "G-Z6KV64S2CK"/);
  assert.match(cookieConsent, /gtag\?\.\("event", "page_view"/);
  assert.match(cookieConsent, /savedChoice === "analytics"/);
  assert.match(magazine, /ARTICLE_SIDEBAR_MODE = "latest"/);
  assert.match(magazine, /getPublishedArticleSummaries\(\{ limit: 40 \}\)/);
  assert.match(detail, /sidebarLabel = magazine\.sidebarMode === "latest" \? "Najnovšie články"/);
  assert.doesNotMatch(detail, /Najčítanejšie/i);
  assert.doesNotMatch(magazine, /Najčítanejšie/i);
  assert.doesNotMatch(articleStore, /\bview_count\b|\bpage_views\b|\bpopularity_score\b/i);
});

test("manual related article reuses the canonical related block and is revalidated through the published reader", () => {
  assert.match(selection, /article\.blocks\?\.find\(\(block\) => block\.type === "related"\)/);
  assert.match(selection, /normalizedInternalArticlePath\(related\.href\)/);
  assert.match(magazine, /getPublishedArticle\(slug\)/);
  assert.match(magazine, /candidate\.slug === article\.slug/);
  assert.match(magazine, /articleHref\(candidate\).*=== path/s);
  assert.match(articleStore, /WHERE slug = \? AND \(status = 'published' OR \(status = 'scheduled' AND published_at <= \?\)\)/);
  assert.match(adminBlockEditor, /item\.id !== currentArticleId && item\.status === "published"/);
});

test("automatic related placement is deterministic, topic-scoped and duplicate-safe", () => {
  assert.match(selection, /candidate\.slug === article\.slug/);
  assert.match(selection, /portalSection\(candidate\) !== portalSection\(article\)/);
  assert.match(selection, /candidate\.newsCategory === article\.newsCategory/);
  assert.match(selection, /candidate\.portalSubpage === article\.portalSubpage/);
  assert.match(selection, /candidate\.category === article\.category/);
  assert.match(magazine, /selectAutomaticMidRelated\(article, topicCandidates\)/);
  assert.match(selection, /selectEndRelated/);
  assert.match(selection, /selectLatestSidebar/);
  assert.match(selection, /seen\.has\(candidate\.slug\)/);
  assert.match(selection, /endRelated\.map\(\(item\) => item\.slug\)/);
});

test("mid-article related card uses a structurally safe 30-50 percent block boundary", () => {
  assert.match(detail, /contentBlocks\.length >= 2 \? magazine\.midRelated : null/);
  assert.match(detail, /Math\.round\(contentBlocks\.length \* 0\.4\)/);
  assert.match(detail, /contentBeforeRelated/);
  assert.match(detail, /contentAfterRelated/);
  assert.match(detail, /SÚVISIACI ČLÁNOK/);
  assert.match(detail, /className=\{styles\.midRelatedImage\}/);
  assert.match(styles, /\.midRelatedLabel[\s\S]*color:\s*var\(--coral/);
});

test("editor-authored related blocks are removed from arbitrary body flow and sources stay at the article end", () => {
  assert.match(detail, /block\.type !== "source" && block\.type !== "related"/);
  assert.match(detail, /const sourceBlocks = blocks\.filter\(\(block\) => block\.type === "source"\)/);
  const before = indexOfOrFail(detail, "<ArticleBlocks blocks={contentBeforeRelated} />", "first article block segment is missing");
  const mid = indexOfOrFail(detail, "className={styles.midRelated}", "mid related card is missing");
  const after = indexOfOrFail(detail, "<ArticleBlocks blocks={contentAfterRelated} />", "second article block segment is missing");
  const sources = indexOfOrFail(detail, "{sourceBlocks.length > 0 ? <ArticleBlocks blocks={sourceBlocks} /> : null}", "sources are missing");
  assert.ok(before < mid && mid < after && after < sources);
});

test("article header follows compact editorial hierarchy and keeps save/share with metadata", () => {
  const kicker = indexOfOrFail(detail, "className={styles.kicker}", "category kicker is missing");
  const title = indexOfOrFail(detail, "<h1>{article.title}</h1>", "headline is missing");
  const excerpt = indexOfOrFail(detail, "<p>{article.excerpt}</p>", "perex is missing");
  const meta = indexOfOrFail(detail, "className={styles.metaActions}", "metadata actions are missing");
  const favorite = indexOfOrFail(detail, "<FavoriteButton slug={article.slug} />", "favorite is missing");
  const compactShare = indexOfOrFail(detail, "url={canonical} compact", "compact header share is missing");
  const figure = indexOfOrFail(detail, "className={styles.heroFigure}", "hero figure is missing");
  assert.ok(kicker < title && title < excerpt && excerpt < meta && meta < favorite && favorite < compactShare && compactShare < figure);
  assert.match(styles, /font-size:\s*clamp\(2\.05rem,\s*3\.7vw,\s*2\.9rem\)/);
  assert.match(styles, /\.modernArticle \.heroMedia[\s\S]*aspect-ratio:\s*16 \/ 8\.8/);
  assert.match(styles, /max-height:\s*520px/);
});

test("desktop magazine layout keeps a readable 70/30 composition and truthful sticky sidebar", () => {
  assert.match(styles, /--article-reading-width:\s*720px/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*var\(--article-reading-width\)\)\s+minmax\(220px,\s*300px\)/);
  assert.match(styles, /\.sidebarSticky[\s\S]*position:\s*sticky[\s\S]*top:\s*96px/);
  assert.match(detail, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(styles, /\.sidebarRank[\s\S]*color:\s*var\(--coral/);
  assert.match(detail, /<time dateTime=\{item\.dateIso\}>\{item\.date\}<\/time>/);
});

test("mobile article composition stacks the sidebar, preserves 44px controls and prevents deliberate horizontal expansion", () => {
  assert.match(styles, /@media \(max-width: 960px\)[\s\S]*\.magazineLayout[\s\S]*grid-template-columns:\s*minmax\(0,\s*var\(--article-reading-width\)\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /\.favoriteAction :global\(\.favorite-button\)[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/);
  assert.match(shareStyles, /min-height:\s*var\(--ps-control-min-height,\s*44px\)/);
  assert.match(styles, /\.article-block-table-wrap\)[^{]*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.article-block-image--wide\)[^{]*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.doesNotMatch(styles, /width:\s*calc\(100vw \+/);
});

test("article without hero image keeps a deliberate placeholder instead of collapsing the composition", () => {
  assert.match(detail, /article\.image \? \(/);
  assert.match(detail, /article-hero-placeholder--\$\{article\.accent\}/);
  assert.match(detail, /<PawMark size=\{72\} \/>/);
});

test("article with no safe related candidate renders no mid card or recommendation section", () => {
  assert.match(selection, /return candidates\.find\(\(candidate\) => sameArticleTopic\(article, candidate\)\) \?\? null/);
  assert.match(detail, /\{structurallySafeMidRelated \? \(/);
  assert.match(detail, /\{relatedItems\.length > 0 \? \(/);
});

test("end recommendations use three unique items and the requested editorial heading", () => {
  assert.match(selection, /slice\(0, Math\.max\(0, limit\)\)/);
  assert.match(magazine, /selectEndRelated\(article, endCandidates, midRelated, 3\)/);
  assert.match(detail, /items\.findIndex\(\(candidate\) => candidate\.slug === item\.slug\) === index/);
  assert.match(detail, /<h2>Ďalšie články k téme<\/h2>/);
  assert.match(detail, /<PublicContentList label="Ďalšie články k téme"/);
});

test("save and share remain available in header and at article end", () => {
  assert.match(detail, /<FavoriteButton slug=\{article\.slug\} \/>/);
  assert.match(detail, /<ShareButton title=\{article\.title\} label=\{shareLabel\} url=\{canonical\} compact \/>/);
  assert.match(detail, /id="zdielat-clanok"/);
  assert.match(shareComponent, /compact\?: boolean/);
  assert.match(shareComponent, /supportsNativeShare \? nativeShare : copyLink/);
  assert.match(shareComponent, /facebook\.com\/sharer\/sharer\.php/);
  assert.match(shareComponent, /wa\.me/);
  assert.match(shareComponent, /navigator\.clipboard\.writeText/);
});

test("TOC remains deterministic, collapsed, keyboard focusable and bound to heading anchors", () => {
  assert.match(detail, /articleBlockHeadings\(blocks\)/);
  assert.match(detail, /const showTableOfContents = readMinutes >= 8 && h2Count >= 5/);
  assert.match(detail, /<details className=\{styles\.toc\}>/);
  assert.doesNotMatch(detail, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(detail, /<nav aria-label="Obsah článku">/);
  assert.match(blocks, /const headingIds = new Map\(articleBlockHeadings\(blocks\)/);
  assert.match(blocks, /<h2 id=\{headingIds\.get\(block\.id\)\}/);
  assert.match(styles, /\.toc summary:focus-visible/);
});

test("article schema and metadata preserve canonical, dates, author and image semantics", () => {
  assert.match(detail, /"@type": section === "novinky" \? "NewsArticle" : "Article"/);
  assert.match(detail, /datePublished: article\.dateIso/);
  assert.match(detail, /dateModified: article\.updatedDateIso/);
  assert.match(detail, /author: articleAuthorJsonLd\(authorName\)/);
  assert.match(detail, /mainEntityOfPage:/);
  assert.match(detail, /image: image \? \[image\] : undefined/);
  assert.match(articleSeo, /canonical = seo\?\.canonicalUrl \|\| articleHref\(article\)/);
  assert.match(articleSeo, /publishedTime: article\.dateIso/);
  assert.match(articleSeo, /modifiedTime: article\.updatedDateIso/);
  assert.match(articleSeo, /authors: \[article\.author\]/);
});

test("hero image accessibility metadata remains separate from visible caption and credit", () => {
  assert.match(detail, /article\.imageAlt \|\| article\.title/);
  assert.match(detail, /const showImageMeta = Boolean\(article\.image/);
  assert.match(detail, /<figcaption className=\{styles\.heroImageMeta\}>/);
  assert.match(detail, /article\.imageCaption/);
  assert.match(detail, /article\.imageCredit/);
  assert.match(detail, /safeExternalImageCreditUrl\(article\.imageCreditUrl\)/);
  assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
});


test("canonical author presentation keeps a safe legacy fallback", () => {
  assert.match(detail, /authorProfile\?\.displayName \|\| article\.author/);
  assert.match(detail, /authorProfile\?\.avatarUrl/);
  assert.match(detail, /authorProfile\?\.role/);
  assert.match(articleStore, /export async function getPublishedArticleAuthorProfile/);
  assert.match(articleStore, /getEditorialAuthorProfile\(database, authorProfileId, true\)/);
});

test("Novinky still uses the complete published reader and existing taxonomy", () => {
  const newsHub = readFileSync("components/news-hub.tsx", "utf8");
  assert.match(articleStore, /export async function getAllPublishedArticleSummaries/);
  assert.match(newsHub, /newsCategories\.map/);
  assert.match(newsHub, /newsArticles\.map/);
  assert.match(newsHub, /<PublicContentList/);
});
