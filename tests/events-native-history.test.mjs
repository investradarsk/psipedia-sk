import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage to events always creates a native same-tab browser history entry", () => {
  const search = source("components/home-portal-search.tsx");
  const header = source("components/site-header.tsx");
  const sidebar = source("components/home-editorial.tsx");

  assert.match(search, /item\.href === "\/podujatia"[\s\S]*?<a href=\{item\.href\}[^>]*data-events-native-entry/);
  assert.match(header, /item\.href === "\/podujatia"[\s\S]*?<a href=\{item\.href\}[^>]*data-events-native-entry/);
  assert.match(sidebar, /href === "\/podujatia"[\s\S]*?<a href=\{href\}[^>]*data-events-native-entry/);
  assert.doesNotMatch(search, /target="_blank"/);
  assert.doesNotMatch(sidebar, /target="_blank"/);
});

test("event detail opens as a native link without replacing the events listing", () => {
  const card = source("components/event-card.tsx");
  const calendar = source("components/event-calendar.tsx");
  assert.match(card, /<a data-events-native-detail href=\{eventHref\(event\)\}/);
  assert.match(calendar, /<a [^>]*href=\{eventHref\(event\)\} data-events-native-detail/);
  assert.doesNotMatch(card, /router\.replace|window\.location\.replace/);
  // Calendar month/day/type filtering still updates in place, with no reload.
  assert.match(calendar, /window\.history\.pushState/);
  assert.match(calendar, /clickNavigate\(event,/);
});

test("public events history regression is exercised by real browser Back twice", () => {
  const e2e = source("tests/e2e/mobile-swipe-navigation.spec.ts");
  assert.match(e2e, /iOS Chrome history: homepage shortcut/);
  assert.match(e2e, /await page\.goBack\(\);[\s\S]*?await page\.goBack\(\);/);
  assert.match(e2e, /await expect\(page\)\.toHaveURL\(\/\\\/\$\/\)/);
});
