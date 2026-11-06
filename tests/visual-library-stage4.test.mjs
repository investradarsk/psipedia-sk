import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("stage 4 offers genuine navigable categories, not inert labels", () => {
  const parent = read("components/admin-visual-library.tsx");
  const viewer = read("components/admin-visual-library-other.tsx");
  const page = read("app/admin/komponenty/page.tsx");
  assert.match(parent, /setCategory\(id\)/);
  assert.match(parent, /\["hero", "Hero sekcie"\]/);
  assert.match(parent, /\["cta", "CTA tlačidlá"\]/);
  assert.match(parent, /\["karty", "Karty"\]/);
  assert.match(parent, /<AdminVisualLibraryOther/);
  assert.match(page, /getVisualLibraryExamples\(\)/);
  assert.match(viewer, /chosen\.preview/);
  assert.match(viewer, /Otvoriť umiestnenie/);
  assert.doesNotMatch(viewer, /<iframe/);
});

test("hero examples use same actual managed public hero and real photo settings", () => {
  const source = read("components/admin-visual-library-examples.server.tsx");
  const breeds = read("app/plemena/page.tsx");
  const news = read("app/clanky/page.tsx");
  assert.match(source, /getSectionHeroVisual\("section\.plemena"\)/);
  assert.match(source, /getSectionHeroVisual\("section\.novinky"\)/);
  assert.match(source, /UnifiedSectionHero\(\{/);
  assert.match(source, /<HomePortalSearch/);
  assert.match(breeds, /<UnifiedSectionHeroShell id=\{HERO_BREEDS_ANCHOR\}/);
  assert.match(news, /<UnifiedSectionHeroShell id=\{HERO_ARTICLES_ANCHOR\}/);
});

test("primary and secondary CTA samples link to exact public DOM anchors", () => {
  const examples = read("components/admin-visual-library-examples.server.tsx");
  const directory = read("components/directory-page.tsx");
  const help = read("components/help-overview.tsx");
  assert.match(examples, /<PublicActionLink href="\/mapa" variant="primary">/);
  assert.match(examples, /<PublicActionLink href="\/pomoc-psom\/utulky" variant="tertiary">/);
  assert.match(examples, /anchorId: "help-overview-utulky"/);
  assert.match(directory, /<PublicActionLink\s+id=\{CTA_DIRECTORY_MAP_ANCHOR\}\s+variant="primary"/);
  assert.match(help, /id=\{`help-overview-\$\{section\.slug\}`\}/);
  assert.match(help, /<PublicActionLink href=\{section\.href\} variant="tertiary"/);
});

test("article card uses real published article and stable rendered anchor", () => {
  const examples = read("components/admin-visual-library-examples.server.tsx");
  const browser = read("components/article-browser.tsx");
  const card = read("components/article-list-item.tsx");
  const publicVisual = read("components/public-visual-system/public-visual-system.tsx");
  assert.match(examples, /getPublishedArticleSummaries\(\{ limit: 1 \}\)/);
  assert.match(examples, /<ArticleListItem article=\{newestArticle\}/);
  assert.match(browser, /anchorId=\{articleListCardAnchor\(article\.slug\)\}/);
  // The compatibility wrapper forwards all props; the shared card passes
  // anchorId to the actual published article link.
  assert.match(card, /anchorId\?: string/);
  assert.match(card, /<ArticleCard \{\.\.\.props\} variant="row" \/>/);
  const canonicalCard=read("components/article-card.tsx");
  const canonicalRenderer=read("components/public-visual-system/public-article-card.tsx");
  assert.match(canonicalCard, /anchorId=\{anchorId\}/);
  assert.match(canonicalRenderer, /<Link\s+id=\{anchorId\}/);
  assert.match(publicVisual, /PublicArticleCard/);
});
