import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const puppyTopics = read("components/editorial-section.tsx");
const breedCollection = read("components/breed-article-collection.tsx");
const breedArchive = read("app/clanky/plemena/page.tsx");
const cards = read("components/editorial-topic-article-grid.tsx");
const cardsCss = read("components/editorial-topic-article-grid.module.css");
const collectionCss = read("components/breed-article-collection.module.css");

test("Šteniatka topic, breed atlas and breed archive all reuse one editorial article renderer", () => {
  assert.match(puppyTopics, /if \(topicGrid\) \{\s*return <EditorialTopicArticleGrid/);
  assert.match(breedCollection, /<EditorialTopicArticleGrid[\s\S]*articles=\{articles\}/);
  assert.match(breedArchive, /<EditorialTopicArticleGrid[\s\S]*articles=\{result\.articles\}/);
  assert.doesNotMatch(breedCollection, /<ArticleCard/);
  assert.doesNotMatch(breedArchive, /<ArticleCard/);
});

test("cards reproduce the Šteniatka stacked photographic row style rather than a new boxed card", () => {
  assert.match(cards, /<PublicContentList/);
  assert.match(cards, /<ArticleListItem key=\{article\.slug\} article=\{article\} desktopLayout="stacked"/);
  assert.match(cardsCss, /background: transparent/);
  assert.match(cardsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cardsCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(cardsCss, /\.constrained \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(collectionCss, /background: transparent/);
  assert.doesNotMatch(collectionCss, /border: 1px solid var\(--ps-border-soft\)/);
});

test("navigation and editorial limits are unchanged by the visual refactor", () => {
  assert.match(breedCollection, /limit=\{3\}/);
  assert.match(breedCollection, /href=\{href\}/);
  assert.match(breedArchive, /getPublishedBreedArticleArchivePage/);
  assert.match(breedArchive, /fciGroups\.map/);
  assert.match(breedArchive, /hasPrevious/);
  assert.match(breedArchive, /hasNext/);
  assert.match(breedArchive, /name="q"/);
});
