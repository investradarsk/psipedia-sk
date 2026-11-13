import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicPaginationPages } from "../lib/public-pagination.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("compact page window uses bounds, neighbors and ellipsis gaps", () => {
  assert.deepEqual(publicPaginationPages(1, 1), [1]);
  assert.deepEqual(publicPaginationPages(1, 2), [1, 2]);
  assert.deepEqual(publicPaginationPages(1, 10), [1, 2, 3, 10]);
  assert.deepEqual(publicPaginationPages(5, 10), [1, 4, 5, 6, 10]);
  assert.deepEqual(publicPaginationPages(10, 10), [1, 8, 9, 10]);
  assert.deepEqual(publicPaginationPages(999, 10), [1, 8, 9, 10]);
  assert.deepEqual(publicPaginationPages(-3, 10), [1, 2, 3, 10]);
});

test("shared control is accessible, native, compact and honest about unknown article totals", () => {
  const src = read("components/public-visual-system/public-result-states.tsx");
  const css = read("components/public-visual-system/public-result-states.module.css");
  assert.match(src, /publicPaginationPages\(currentPage, totalPages\)/);
  assert.match(src, /displayPages\.map\(\(page, index\)/);
  assert.match(src, /totalPages === null/);
  assert.match(src, /aria-current="page">Strana \{currentPage\}/);
  assert.match(src, /aria-current=\{page === currentPage \? "page" : undefined\}/);
  assert.match(src, /rel="prev"/);
  assert.match(src, /rel="next"/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /justify-content: center/);
  assert.match(css, /\[aria-current="page"\]/);
  assert.match(css, /\.paginationEllipsis/);
});

test("all public listing consumers have numbered links and targeted scroll positions", () => {
  for (const [file, pageLink, anchor] of [
    ["components/directory-results.tsx", "pageHref={(page) => directoryPageHref(", "#directory-results-heading"],
    ["components/directory-club-results.tsx", "pageHref={(page) => pageHref(current, page)}", "#directory-results-heading"],
    ["components/help-browser.tsx", "pageHref={pageHref}", "#help-results-heading"],
    ["components/event-listing-results.tsx", "pageHref={href}", "#events-list"],
    ["components/adoption-catalog.tsx", "pageHref={(page) => adoptionCatalogHref(", "#adoption-results"],
    ["components/lost-found-dogs-page.tsx", "pageHref={(page) => pageHref(type, params, page)}", "#lost-found-results"],
    ["components/profile-review-section.tsx", "pageHref={(page) => reviewPageHref(", "#recenzie"],
    ["app/hladat/page.tsx", "pageHref={(page) => searchHref(", "#search-results"],
  ]) {
    const source = read(file);
    assert.ok(source.includes(pageLink), `Missing numbered links in ${file}`);
    assert.ok(source.includes(anchor), `Missing results anchor in ${file}`);
  }
  assert.match(read("components/event-listing-results.tsx"), /else next\.delete\("strana"\)/);
  const editorial = read("components/editorial-section.tsx");
  assert.match(editorial, /totalPages=\{null\}/);
  assert.match(editorial, /#topic-related-heading/);
});

test("old oversized listing pagination layouts no longer override the shared component", () => {
  const globalCss = read("components/public-visual-system/public-result-global.css");
  const variants = read("components/public-visual-system/public-result-variants.module.css");
  const adoption = read("components/adoption.module.css");
  assert.doesNotMatch(globalCss, /\.directory-pagination\s*\{\s*display: grid/);
  assert.doesNotMatch(variants, /\.searchPagination\s*\{\s*display: grid/);
  assert.doesNotMatch(variants, /\.reviewPagination\s*\{\s*display: flex/);
  assert.doesNotMatch(adoption, /\.pagination span,\s*\.pagination strong\s*\{\s*background:/);
});
