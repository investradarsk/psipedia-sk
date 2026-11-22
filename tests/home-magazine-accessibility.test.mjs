import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homeEditorial = readFileSync(new URL("../components/home-editorial.tsx", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("homepage complementary landmarks get distinguishable accessible names", () => {
  assert.match(homeEditorial, /<aside className="home-magazine-side" aria-label=\{sidebarLabel\}>/);
  assert.doesNotMatch(homeEditorial, /aria-label="Súvisiace informácie"/);
  assert.match(homeEditorial, /sidebarLabel="Súvisiace podujatia k najnovším článkom"/);
  assert.match(homeEditorial, /sidebarLabel=\{\x60Súvisiace k sekcii \$\{title\}\x60\}/);
  assert.equal((homeEditorial.match(/<HomeMagazineColumns sidebar=\{sidebar\} sidebarLabel=/g) ?? []).length, 2);
});

test("homepage renders multiple independent editorial sidebars", () => {
  assert.match(homePage, /<HomeLatestArticles[\s\S]*?sidebar=\{/);
  for (const section of ["steniatka", "starostlivost", "aktivity"]) {
    assert.ok(homePage.includes('testId="' + section + '"'), section);
  }
});
