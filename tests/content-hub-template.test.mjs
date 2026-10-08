import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("puppy and care topics use the existing managed editorial pillar ordering", () => {
  const section = read("components/editorial-section.tsx");
  assert.match(section, /function topicPillar\(subpage: PortalSubpage, articles: Article\[\]\)/);
  assert.match(section, /subpage\.featuredArticleSlugs \?\? \[\]/);
  assert.match(section, /articles\.find\(\(article\) => article\.slug === slug\)/);
  assert.match(section, /topicPillar\(subpage, topicArticles\)/);
  assert.match(section, /remainingArticles = pillar \? topicArticles\.filter/);
  assert.doesNotMatch(section, /latestArticle\s*=|articles\[0\]\s*as\s*pillar/);
});

test("content hubs do not render legacy lengthy guidance panels as parallel blocks", () => {
  const section = read("components/editorial-section.tsx");
  const start = section.indexOf('<div className={styles.contentHub} data-content-hub>');
  const end = section.indexOf('          <p className={styles.safetyNote}>', start);
  assert.ok(start >= 0 && end > start);
  const hub = section.slice(start, end);
  assert.match(hub, /subpage\.intro/);
  assert.match(hub, /data-content-hub-pillar/);
  assert.match(hub, /omitMissingImage/);
  assert.match(hub, /SectionContentList articles=\{remainingArticles\}/);
  for (const field of ["commonQuestions", "homeSteps", "warningSigns", "expertAdvice"]) {
    assert.doesNotMatch(hub, new RegExp(`subpage\\.${field}`));
  }
  assert.match(section, /HealthUrgent/);
  assert.match(section, /safetyNote\(sectionSlug\)/);
  assert.match(section, /sectionSlug === "aktivity" \? \(<>/);
});

test("content hub is responsive without a second article card implementation", () => {
  const section = read("components/editorial-section.tsx");
  const css = read("components/editorial-section.module.css");
  assert.match(section, /<ArticleCard article=\{pillar\}/);
  assert.match(section, /<ArticleListItem article=\{article\}/);
  assert.match(css, /\.contentHub\s*\{/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
