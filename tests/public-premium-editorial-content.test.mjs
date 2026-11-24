import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const detail = read("components/article-detail.module.css");
const section = read("components/editorial-section.module.css");
const news = read("components/news-hub.module.css");
const archive = read("app/clanky/article-listing.module.css");

test("V2-06 uses one Inter reading measure for article grid, text and embedded promos", () => {
  assert.match(detail, /--article-reading-width:\s*min\(800px, var\(--ps-reading-measure\)\)/);
  assert.match(detail, /\.modernArticle\s*\{[^}]*font-family:\s*var\(--ps-reading-font\);[^}]*font-size:\s*var\(--ps-reading-size\)/);
  assert.match(detail, /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*max-width:\s*var\(--ps-reading-measure\)/);
  assert.match(detail, /\.readingShell :global\(\.article-blocks > \[data-home-banner\^="article-"\]\)\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*margin-inline:\s*0/);
  assert.match(detail, /\.readingShell :global\(\.article-block-image--wide\)\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%/);
  assert.match(detail, /\.article-block-table-wrap\)[^{]*\{[^}]*overflow-x:\s*auto/);
});

test("V2-06 editorial titles, metadata, controls and media consume shared tokens", () => {
  assert.match(detail, /\.title h1\s*\{[^}]*font-family:\s*var\(--ps-font-heading\)/);
  assert.match(detail, /\.articleMeta\s*\{[^}]*font-family:\s*var\(--ps-font-body\)/);
  assert.match(detail, /\.heroMedia[^}]*border-radius:\s*var\(--ps-radius-media\)/);
  assert.match(section, /\.topicGroupTitle\s*\{[^}]*font-family:\s*var\(--ps-font-heading\)/);
  assert.match(section, /\.topicCard\s*\{[^}]*border-radius:\s*var\(--ps-radius-card\)/);
  assert.match(news, /\.trust\s*\{[^}]*border-radius:\s*var\(--ps-radius-card\)/);
  assert.match(archive, /\.filter-row button\)\s*\{[^}]*border-radius:\s*var\(--ps-radius-control\)/);
});

test("V2-06 retains shared content renderers and structured topic delegation", () => {
  const route = read("app/[section]/[slug]/page.tsx");
  const article = read("components/article-detail.tsx");
  const topic = read("components/portal-topic.tsx");
  const blocks = read("components/article-blocks.tsx");
  assert.match(route, /<ArticleDetail/);
  assert.match(route, /<NewsHub/);
  assert.match(topic, /return <EditorialSectionTopic/);
  for (const component of ["ArticleBlocks", "AffiliateRotatingBanner", "AdSlot", "ArticlePopularitySidebar", "ArticlePromo", "PublicContentList"]) {
    assert.ok(article.includes("<" + component), component);
  }
  assert.match(blocks, /<PublicPhotoGallery/);
  assert.match(blocks, /<ArticlePromo/);
  assert.match(blocks, /data-columns=/);
});
