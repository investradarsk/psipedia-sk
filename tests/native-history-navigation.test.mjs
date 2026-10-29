import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Chrome iOS navigation is configured once for the entire public layout", () => {
  const layout = source("app/layout.tsx");
  const bridge = source("components/native-history-navigation.tsx");
  assert.match(layout, /<NativeHistoryNavigation\s*\/>/);
  assert.match(bridge, /(?:iPhone\|iPad\|iPod)/);
  assert.match(bridge, /CriOS/);
  assert.match(bridge, /document\.addEventListener\("click", allowBrowserNavigation, true\)/);
  assert.match(bridge, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(bridge, /preventDefault\(|history\.(?:pushState|replaceState|back)\(/);
});

test("existing event listing return and calendar filtering remain unchanged", () => {
  const bridge = source("components/native-history-navigation.tsx");
  const events = source("components/events-return-link.tsx");
  const calendar = source("components/event-calendar.tsx");
  assert.match(events, /data-native-history-skip/);
  assert.match(bridge, /anchor\.closest\("\[data-public-calendar\]"\)/);
  assert.match(bridge, /anchor\.closest\("\[data-event-card\], #vybrany-den li"\)/);
  assert.match(calendar, /window\.history\.pushState/);
  assert.match(calendar, /clickNavigate\(event,/);
});

test("sitewide navigation respects external links, same-page filters, partner and admin", () => {
  const bridge = source("components/native-history-navigation.tsx");
  assert.match(bridge, /next\.origin !== current\.origin/);
  assert.match(bridge, /next\.pathname === current\.pathname/);
  assert.match(bridge, /privatePath\(current\.pathname\) \|\| privatePath\(next\.pathname\)/);
  assert.match(bridge, /event\.metaKey/);
  assert.match(bridge, /anchor\.hasAttribute\("download"\)/);
  assert.match(bridge, /anchor\.target && anchor\.target !== "_self"/);
});

test("sitewide browser history has real two-step E2E, with no new back buttons", () => {
  const e2e = source("tests/e2e/mobile-swipe-navigation.spec.ts");
  const detail = source("components/article-detail.tsx");
  assert.match(e2e, /sitewide Chrome iPhone: homepage/);
  assert.match(e2e, /sitewide Chrome iPhone: calendar month changes stay client-side/);
  assert.match(e2e, /await page\.goBack\(\);[\s\S]*?await page\.goBack\(\);/);
  assert.doesNotMatch(detail, /ArticleReturnLink|data-article-safe-back/);
});
