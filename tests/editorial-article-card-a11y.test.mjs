import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared article row keeps native anchor semantics inside a list-item wrapper", () => {
  const src = read("components/public-visual-system/public-article-card.tsx");
  const row = src.split('if (variant === "row") {')[1].split("  return (\n    <article")[0];
  assert.match(row, /const rowLink = \(\s*<Link/);
  assert.match(row, /return listItem \? <div role="listitem" className=\{cardStyles\.rowListItem\}>\{rowLink\}<\/div> : rowLink;/);
  assert.doesNotMatch(row, /role=\{listItem \? "listitem"/);
  assert.match(row, /data-article-list-item/);
});

test("single or photo-less editorial articles use compact rows, without new card variants", () => {
  const section = read("components/editorial-section.tsx");
  const css = read("components/editorial-section.module.css");
  assert.match(section, /desktopLayout=\{articles\.length > 1 && article\.image \? "stacked" : undefined\}/);
  assert.match(section, /articles\.length === 1 \? `\$\{styles\.contentList\} \$\{styles\.singleArticleList\}`/);
  assert.match(css, /\.singleArticleList \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@media \(min-width: 901px\)/);
});

test("empty editorial topics remain visible without a misleading all-articles link", () => {
  const section = read("components/editorial-section.tsx");
  assert.match(section, /Články z tejto oblasti pripravujeme\./);
  assert.match(section, /\{related\.length > 0 \? \(\s*<div className=\{styles\.topicGroupFooter\}>/);
  assert.match(section, /Všetky články z oblasti/);
});
