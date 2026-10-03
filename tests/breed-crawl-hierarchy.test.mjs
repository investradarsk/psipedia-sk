import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/plemena/page.tsx", "utf8");
const browser = readFileSync("components/breed-browser.tsx", "utf8");
const crawlIndex = readFileSync("components/breed-crawl-index.tsx", "utf8");

test("clean breed landing exposes every canonical breed through ordinary server-rendered links", () => {
  assert.match(page, /policy\.kind === "clean" && <BreedCrawlIndex breeds=\{breeds\} groups=\{fciGroups\} \/>/);
  assert.match(crawlIndex, /import Link from "next\/link"/);
  assert.match(crawlIndex, /for \(const breed of breeds\)/);
  assert.match(crawlIndex, /<Link href=\{\`\/plemena\/\$\{breed\.slug\}\`\}>\{breed\.name\}<\/Link>/);
  assert.doesNotMatch(crawlIndex, /\.slice\(/);
  assert.doesNotMatch(crawlIndex, /onClick=/);
});

test("breed crawl hierarchy does not create indexable pagination or filter variants", () => {
  assert.match(page, /buildListingPageMetadata\(\{/);
  assert.match(page, /path: "\/plemena"/);
  assert.doesNotMatch(page, /indexPagination:\s*true/);
  assert.match(page, /const policy = resolveListingIndexPolicy\("\/plemena", rawSearchParams\)/);
});

test("interactive breed browser keeps the existing 60-card load-more UX", () => {
  assert.match(browser, /useState\(60\)/);
  assert.match(browser, /visible\.slice\(0,shown\)/);
  assert.match(browser, /Zobraziť ďalšie plemená/);
  assert.match(browser, /setShown\(\(value\)=>value\+60\)/);
});
