import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("e-shop rows preserve real link semantics and show a single zero-rating state", () => {
  const components = read("components/public-visual-system/public-visual-system.tsx");
  const item = components.split("export function PublicContentListItem(")[1].split("export function PublicDataCard(")[0];
  assert.match(item, /<div role="listitem"/);
  assert.match(item, /<Link\s+className=/);
  assert.doesNotMatch(item, /<Link[\s\S]*?role="listitem"/);
  const hub = read("components/reviews-hub.tsx");
  assert.match(hub, /: <span>Bez hodnotení<\/span>/);
  assert.doesNotMatch(hub, /<\/span>\}\s*\{" · "\}\s*\{shop\.ratingCount\}/);
  const detail = read("app/recenzie/eshopy/[slug]/page.tsx");
  assert.doesNotMatch(detail, /<DetailContactsCard/);
  assert.match(detail, /Navštíviť e-shop/);
});

test("review editorial format and product subject are distinct in listing and detail", () => {
  const hub = read("components/reviews-hub.tsx");
  const detail = read("components/article-detail.tsx");
  assert.match(hub, /Nákupný sprievodca · Téma:/);
  assert.match(detail, /reviewTypeLabel/);
  assert.match(detail, /Téma: \$\{topicLabel\}/);
});

test("map keeps mobile and Google opt-in, while desktop starts with text results", () => {
  const page = read("app/mapa/page.tsx");
  const map = read("components/map/map-experience.tsx");
  const css = read("components/map/map-public.module.css");
  assert.match(page, /variant="compact"/);
  assert.match(page, /portalSearchSlot=\{<HomePortalSearch \/>\}/);
  assert.match(css, /@media \(min-width: 821px\)/);
  assert.match(css, /data-map-activated="false"/);
  assert.match(map, /googleMapsConsent && mapActivated/);
  assert.match(map, /onGrant=\{\(\) => \{/);
  assert.match(map, /googleMapsUrl && !directionsUrl/);
});

test("help categories, reports and pagination retain canonical targets and readable status", () => {
  const helpPage = read("components/help-page.tsx");
  const report = read("components/lost-found-dogs-page.tsx");
  const css = read("components/lost-found-dogs.module.css");
  const globalCss = read("components/public-visual-system/public-result-global.css");
  assert.match(helpPage, /if \(category === "stratene-a-najdene"\) return "\/pomoc-psom\/stratene-a-najdene"/);
  assert.match(report, /activeDogReportCountNoun\(result\.total\)/);
  assert.match(report, /dogReportStatusLabel\[report\.status\]/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(globalCss, /#help-results-heading[\s\S]*scroll-margin-top/);
  const browser = read("components/help-browser.tsx");
  assert.match(browser, /resetHref=\{basePath\}/);
  assert.doesNotMatch(browser, /Vymazať všetko/);
});
