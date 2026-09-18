import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detail = readFileSync("components/article-detail.tsx", "utf8");
const blocks = readFileSync("components/article-blocks.tsx", "utf8");
const styles = readFileSync("components/article-detail.module.css", "utf8");
const shareComponent = readFileSync("components/share-button.tsx", "utf8");
const newsHub = readFileSync("components/news-hub.tsx", "utf8");
const articleStore = readFileSync("lib/article-store.ts", "utf8");

function indexOfOrFail(source, value, message) {
  const index = source.indexOf(value);
  assert.notEqual(index, -1, message);
  return index;
}

test("article TOC is deterministic, collapsed and built from existing heading anchors", () => {
  assert.match(detail, /articleBlockHeadings\(blocks\)/);
  assert.match(detail, /const h2Count = headings\.filter\(\(heading\) => heading\.level === 2\)\.length/);
  assert.match(detail, /const showTableOfContents = readMinutes >= 8 && h2Count >= 5/);
  assert.match(detail, /<details className=\{styles\.toc\}>/);
  assert.doesNotMatch(detail, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(detail, /<summary>Obsah článku<\/summary>/);
  assert.match(detail, /<nav aria-label="Obsah článku">/);
  assert.match(detail, /href=\{`#\$\{heading\.id\}`\}/);
  assert.match(blocks, /const headingIds = new Map\(articleBlockHeadings\(blocks\)/);
  assert.match(blocks, /<h2 id=\{headingIds\.get\(block\.id\)\}/);
  assert.match(blocks, /<h3 id=\{headingIds\.get\(block\.id\)\}/);
  assert.match(styles, /\.toc summary:focus-visible\s*\{/);
});

test("mobile composition starts with prose and keeps takeaway inline after the intro", () => {
  const articleStart = indexOfOrFail(detail, "<article className=\"article-prose\">", "article prose is missing");
  const intro = indexOfOrFail(detail, "<EditorialRichText className=\"article-intro\"", "article intro is missing");
  const takeaway = indexOfOrFail(detail, "{showTakeaway ? <aside className=\"takeaway-box\"", "optional takeaway is missing");
  const toc = indexOfOrFail(detail, "{showTableOfContents ?", "conditional TOC is missing");
  const body = indexOfOrFail(detail, "<ArticleBlocks blocks={contentBlocks} />", "article body blocks are missing");

  assert.ok(articleStart < intro && intro < takeaway && takeaway < toc && toc < body, "reading DOM order regressed");
  assert.match(detail, /const showTakeaway = editorialRichTextPlainText\(takeawayDocument\)\.length > 0/);
  assert.doesNotMatch(detail, /article-aside/);
  assert.doesNotMatch(detail, /cardShellClassName/);
  assert.doesNotMatch(styles, /position:\s*(?:sticky|fixed)/);
});

test("favorite stays in the header while share moves to the article end", () => {
  const favorite = indexOfOrFail(detail, "<FavoriteButton slug={article.slug} />", "favorite action is missing");
  const readingShell = indexOfOrFail(detail, "<div className={`${styles.readingShell} shell`}>", "reading shell is missing");
  const share = indexOfOrFail(detail, "<ShareButton title={article.title} label={shareLabel} url={canonical} />", "share action is missing");
  const disclaimer = indexOfOrFail(detail, "<p className=\"article-disclaimer\">", "article disclaimer is missing");

  assert.ok(favorite < readingShell, "favorite must remain in the article header");
  assert.ok(disclaimer < share, "share must be an end-of-article action");
});

test("sources are separated from content blocks and rendered at the end", () => {
  assert.match(detail, /const contentBlocks = blocks\.filter\(\(block\) => block\.type !== "source"\)/);
  assert.match(detail, /const sourceBlocks = blocks\.filter\(\(block\) => block\.type === "source"\)/);
  const content = indexOfOrFail(detail, "<ArticleBlocks blocks={contentBlocks} />", "content blocks are missing");
  const sources = indexOfOrFail(detail, "{sourceBlocks.length > 0 ? <ArticleBlocks blocks={sourceBlocks} /> : null}", "end sources are missing");
  assert.ok(content < sources, "sources must follow article content");
});

test("article reading CSS preserves editorial measures and mobile overflow safety", () => {
  assert.match(styles, /--article-reading-width:\s*680px/);
  assert.match(styles, /font-size:\s*1rem;\s*\n\s*line-height:\s*1\.68/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /font-size:\s*1rem;\s*\n\s*line-height:\s*1\.65/);
  assert.match(styles, /aspect-ratio:\s*16 \/ 9/);
  assert.match(styles, /border-radius:\s*14px/);
  assert.match(styles, /\.article-block-table-wrap\)[^{]*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.article-block-image--wide\)[^{]*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.doesNotMatch(styles, /-webkit-line-clamp/);
  assert.doesNotMatch(styles, /\.hero\s+:global\(\.article-breadcrumbs\)[^{]*\{[^}]*display:\s*none/s);
});

test("end recommendations use the FOUNDATION-PUBLIC compact content list", () => {
  assert.match(detail, /const relatedItems = related\.slice\(0, 3\)/);
  assert.match(detail, /<PublicContentList label="Súvisiace články"/);
  assert.match(detail, /<PublicContentListItem/);
  assert.doesNotMatch(detail, /<ArticleCard\b/);
});

test("canonical author presentation keeps a safe legacy fallback", () => {
  assert.match(detail, /authorProfile\?\.displayName \|\| article\.author/);
  assert.match(detail, /authorProfile\?\.avatarUrl/);
  assert.match(detail, /authorProfile\?\.role/);
  assert.match(articleStore, /export async function getPublishedArticleAuthorProfile/);
  assert.match(articleStore, /getEditorialAuthorProfile\(database, authorProfileId, true\)/);
});

test("sharing exposes Facebook, WhatsApp, native share and copy without fake social endpoints", () => {
  assert.match(shareComponent, /facebook\.com\/sharer\/sharer\.php/);
  assert.match(shareComponent, /wa\.me/);
  assert.match(shareComponent, /typeof navigator\.share === "function"/);
  assert.match(shareComponent, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(shareComponent, /instagram|tiktok|messenger/i);
});

test("Novinky uses a complete public reader and existing category taxonomy", () => {
  assert.match(articleStore, /export async function getAllPublishedArticleSummaries/);
  const readerStart = articleStore.indexOf("export async function getAllPublishedArticleSummaries");
  const readerEnd = articleStore.indexOf("/** Backwards-compatible public listing", readerStart);
  assert.ok(readerStart >= 0 && readerEnd > readerStart);
  assert.doesNotMatch(articleStore.slice(readerStart, readerEnd), /LIMIT \?/);
  assert.match(newsHub, /Všetky publikované novinky/);
  assert.match(newsHub, /newsCategories\.map/);
  assert.match(newsHub, /newsArticles\.map/);
  assert.doesNotMatch(newsHub, /slice\(0,\s*[345]\)/);
  assert.match(newsHub, /<PublicContentList/);
});
