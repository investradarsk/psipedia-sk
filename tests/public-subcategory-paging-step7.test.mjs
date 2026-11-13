import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publicSubcategoryPageGroups,
  PUBLIC_SUBCATEGORY_PAGE_SIZE,
} from "../lib/public-subcategory-paging.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one to six categories render on a single page without empty slots", () => {
  assert.equal(PUBLIC_SUBCATEGORY_PAGE_SIZE, 6);
  for (let n = 0; n <= 6; n++) {
    const items = Array.from({ length: n }, (_, i) => `category-${i}`);
    const groups = publicSubcategoryPageGroups(items);
    assert.equal(groups.length, n ? 1 : 0);
    assert.deepEqual(groups.flat(), items);
  }
});

test("seven, twelve and thirteen categories group 6 + remainder without duplicates", () => {
  for (const [count, sizes] of [[7, [6, 1]], [12, [6, 6]], [13, [6, 6, 1]]]) {
    const items = Array.from({ length: count }, (_, i) => `category-${i}`);
    const groups = publicSubcategoryPageGroups(items);
    assert.deepEqual(groups.map((page) => page.length), sizes);
    assert.deepEqual(groups.flat(), items);
    assert.equal(new Set(groups.flat()).size, count);
  }
});

test("same canonical navigator serves Help, Directory, Events, News and editorial sections", () => {
  const components = [
    "components/public-visual-system/public-help-category-nav.tsx",
    "components/directory-category-navigation.tsx",
    "components/events-page.tsx",
    "components/news-hub.tsx",
    "components/portal-section-tabs.tsx",
  ];
  for (const path of components) {
    const source = read(path);
    assert.match(source, /<PublicSubcategoryNavigator/, path);
    assert.match(source, /mode="compact"/, path);
    assert.match(source, /mobileLayout="grid"/, path);
    assert.match(source, /columns=\{6\}/, path);
  }
  const news = read("components/news-hub.tsx");
  const editorial = read("components/portal-section-tabs.tsx");
  assert.doesNotMatch(news, /<PortalMobileCategorySelect/);
  assert.doesNotMatch(editorial, /<PortalMobileCategorySelect/);
  assert.equal(news.match(/data-news-category-navigation/g)?.length, 1);
  assert.match(read("components/events-page.tsx"), /eventTypePortalHref\(type\)/);
});

test("desktop is one visible grid; mobile pages swipe by six with touch, arrows, dots and active selection", () => {
  const nav = read("components/public-visual-system/public-subcategory-navigator.tsx");
  const pager = read("components/public-visual-system/public-subcategory-paged-track.tsx");
  const css = read("components/public-visual-system/public-subcategory-navigator.module.css");
  assert.match(nav, /items\.length > PUBLIC_SUBCATEGORY_PAGE_SIZE/);
  assert.match(nav, /publicSubcategoryPageGroups\(items\)/);
  assert.match(nav, /item\.current/);
  assert.match(nav, /<CompactItem/);
  assert.match(nav, /data-public-subcategory-track/);
  assert.match(pager, /useRef<HTMLDivElement>/);
  assert.match(pager, /onScroll=\{updatePageFromScroll\}/);
  assert.match(pager, /aria-label="Predchádzajúcich šesť kategórií"/);
  assert.match(pager, /aria-label="Ďalších šesť kategórií"/);
  assert.match(pager, /aria-current=\{index === activePage \? "step" : undefined\}/);
  assert.match(pager, /disabled=\{activePage === lastPage\}/);
  assert.match(pager, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.pagedPage \{ display: contents; \}/);
  assert.match(css, /\.compactGridMobile \.pagedTrack/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(css, /\.compactGridMobile \.pagedPage/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.pagedDotActive/);
  assert.match(css, /\.compactGridMobile \.compactTrack:not\(\.pagedTrack\)/);
});
