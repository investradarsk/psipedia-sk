import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Help, Services and Events use the shared category section", () => {
  const shared = read("components/public-visual-system/public-category-section.tsx");
  const css = read("components/public-visual-system/public-category-section.module.css");
  const index = read("components/public-visual-system/index.ts");
  assert.match(index, /export \{ PublicCategorySection \}/);
  assert.match(shared, /<PublicLandingSectionHeading/);
  assert.match(shared, /data-public-category-navigation/);
  assert.match(css, /aria-current="page"/);
  assert.match(css, /--coral-dark/);

  for (const path of [
    "components/help-overview.tsx",
    "components/directory-page.tsx",
    "components/events-page.tsx",
  ]) {
    assert.match(read(path), /<PublicCategorySection/, path);
  }
  assert.match(read("components/directory-category-navigation.tsx"), /items=\{items\.map/);
  assert.match(read("components/events-page.tsx"), /icon: eventCategoryIcons\[type\]/);
});

test("categories precede the shared organizer CTA, affiliate and calendar", () => {
  const source = read("components/events-page.tsx");
  const organizer = source.indexOf('title="Organizujete podujatie?"');
  const affiliate = source.indexOf("<AffiliateRotatingBanner");
  const categories = source.indexOf("data-event-category-navigation");
  const calendar = source.indexOf("<EventCalendar");
  assert.ok(categories > 0 && categories < organizer && organizer < affiliate && affiliate < calendar);
  assert.equal(source.match(/Organizujete podujatie\?/g)?.length, 1);
  assert.doesNotMatch(source, /afterCalendar=\{/);
  assert.match(source, /href="\/podujatia\/pridat-podujatie"/);
  assert.match(source, /<PublicMagazineBanner[\s\S]*?testId="events-organizer-cta"/);
});

test("contextual coral banners use cream rather than pale pink", () => {
  const css = read("components/public-visual-system/public-context-banner.module.css");
  const tone = css.match(/\.tone_coral\s*\{([^}]+)\}/)?.[1];
  assert.ok(tone);
  assert.match(tone, /#f8f4eb/);
  assert.match(tone, /border-left:\s*3px solid/);
  assert.doesNotMatch(tone, /#fff0ea/);
});

test("event period remains a separate, labeled navigator", () => {
  assert.match(read("components/event-calendar.tsx"), /Obdobie podujatí/);
  assert.match(read("components/events-public.module.css"), /\.periodLabel/);
});
