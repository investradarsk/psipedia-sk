import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V2-14 search cards and calendar use the canonical visual tokens", () => {
  const search = read("app/hladat/search.module.css");
  for (const token of ["--ps-radius-card", "--ps-radius-control", "--ps-font-heading", "--ps-ds5-card-transition", "min-height: 44px", ":focus-visible"]) assert.ok(search.includes(token), token);
  const calendar = read("components/dog-name-day-calendar.module.css");
  for (const token of ["--ps-font-heading", "--ps-radius-card", "--ps-radius-control", 'data-today="true"', 'data-selected="true"', "max-width: 430px"]) assert.ok(calendar.includes(token), token);
  assert.doesNotMatch(calendar, /font-family: Georgia/);
});

test("V2-14 map preserves semantic markers, responsive dock and focus while using shared surfaces", () => {
  const css = read("components/map/map-public.module.css");
  for (const token of ["--ps-radius-card", "--ps-radius-control", "--ps-component-shadow", ".approximateMarker", ".selectedMarker", ".mobileFilterDialog", "prefers-reduced-motion", ":focus-visible", "border-radius: 50% 50% 50% 12px"]) assert.ok(css.includes(token), token);
});

test("V2-14 gallery and utility controls preserve accessible geometry", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.module.css");
  for (const token of ["--ps-radius-media", "--ps-radius-card", "--ps-font-body", "object-fit: contain", ":focus-visible"]) assert.ok(gallery.includes(token), token);
  assert.doesNotMatch(gallery, /Avenir/);
  const share = read("components/share-button.module.css");
  assert.doesNotMatch(share, /min-height: (40|42)px/);
  assert.match(share, /--ps-control-min-height, 44px/);
});

test("V2-14 cookie panel and not-found styles use canonical tokens without removing controls", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.cookie-consent \{[^}]*border-radius: var\(--ps-radius-card\)/);
  assert.match(css, /\.cookie-consent \{[^}]*background: var\(--paper\)/);
  assert.match(css, /\.not-found h1 \{[^}]*font-family: var\(--ps-font-heading\)/);
  assert.ok(css.includes('body:has([data-testid="map-filter-dialog"]) .cookie-consent'));
  assert.match(read("components/outreach-unsubscribe-form.tsx"), /<PublicNotice[\s\S]*tone=\{result.type/);
});
