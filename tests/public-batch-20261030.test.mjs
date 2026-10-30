import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage has one clean, non-underlined headline, and footer preserves direct contact and one cookie control", () => {
  const home = read("app/page.tsx");
  const footer = read("components/site-footer.tsx");
  assert.match(home, /Všetko dôležité/);
  assert.match(home, /pre život so psom/);
  assert.doesNotMatch(home, /<em>Každý deň o trochu viac/);
  assert.match(footer, /href="\/kontakt">Kontakt/);
  assert.match(read("app/kontakt/page.tsx"), /export default function ContactPage/);
  assert.match(footer, /<CookieSettingsButton \/>/);
  assert.doesNotMatch(footer, /href="\/cookies"/);
});

test("breed atlas uses the established photo banner for clubs and one comparison link", () => {
  const page = read("app/plemena/page.tsx");
  assert.match(page, /<PublicMagazineBanner/);
  assert.match(page, /testId="breed-clubs"/);
  assert.match(page, /href="\/porovnat-plemena"/);
  assert.match(page, /href="\/adresar\/chovatelske-kluby"/);
  assert.doesNotMatch(page, /Čo chceš urobiť\?/);
});

test("public dog name-day search only returns published records and navigates to their calendar dates", () => {
  const store = read("lib/dog-name-day-store.ts");
  const page = read("app/psie-meniny/page.tsx");
  assert.match(store, /export async function searchPublishedDogNameDays/);
  assert.match(store, /status = 'published' AND instr\(normalized_name, \?\) > 0/);
  assert.match(page, /name="meno"/);
  assert.match(page, /enterKeyHint="search"/);
  assert.match(page, /matchingNames\.map/);
  assert.match(page, /den=\$\{dayDate\}/);
  assert.match(page, /<DogNameDayCalendar/);
});

test("map has an explicit search submit and a visible labeled mobile filter control", () => {
  const map = read("components/map/map-experience.tsx");
  const css = read("components/map/map-public.module.css");
  assert.match(map, /<form className=\{styles\.mapSearchForm\} role="search"/);
  assert.match(map, /type="submit">Hľadať/);
  assert.match(map, /enterKeyHint="search"/);
  assert.match(map, /<span>Filtre<\/span>/);
  assert.match(read("app/mapa/page.tsx"), /hideQuickLinks/);
  assert.match(read("components/public-visual-system/unified-section-hero.tsx"), /hideQuickLinks \|\| portalSearchSlot \? \[\] : activeShortcuts/);
  assert.match(css, /\.filterButton > span:first-child \{\s*position: static/);
});

test("events have one heading per section, return link after map and nonduplicated image alt", () => {
  const event = read("components/event-detail.tsx");
  const shared = read("components/detail-primitives/detail-primitives.tsx");
  assert.ok(event.indexOf("<EventsBackLink") > event.indexOf("</PublicDetailLayout>"));
  assert.match(event, /<DetailSection title="Praktické informácie"/);
  assert.doesNotMatch(event, /<DetailSection eyebrow="Pred návštevou"/);
  assert.match(event, /alt="Fotografia podujatia" loading="eager"/);
  assert.doesNotMatch(shared, /eyebrow && <span className=\{styles\.eyebrow\}/);
});

test("shared adoption detail layout stacks contact after story even with a direct aside", () => {
  const css = read("components/detail-primitives/detail-primitives.module.css");
  const adoptionCss = read("components/adoption-detail.module.css");
  assert.match(css, /@media \(max-width: 800px\) \{\s*\.publicDetailInline:has\(> aside\) \{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(adoptionCss, /@media \(max-width: 620px\) \{\s*\.heroActions \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("lost-and-found hub reuses exactly the Help report photo banner", () => {
  const hub = read("app/pomoc-psom/stratene-a-najdene/page.tsx");
  const help = read("components/help-overview.tsx");
  const banner = read("components/public-visual-system/public-help-banner.tsx");
  assert.match(hub, /<PublicHelpPhotoBanner promo=\{lostFoundSubmitPromo\}/);
  assert.match(help, /lostFoundSubmitPromo/);
  assert.match(banner, /href: "\/pomoc-psom\/stratene-a-najdene\/nahlasit"/);
});

test("shelter cards avoid stale update dates and repeated organization names", () => {
  const card = read("components/help-card.tsx");
  const overview = read("app/pomoc-psom/page.tsx");
  assert.match(card, /item\.category === "utulky" \? null/);
  assert.match(card, /showOrganization/);
  assert.match(card, /item\.organization\.trim\(\)\.toLocaleLowerCase/);
  assert.match(overview, /item\.category === "utulky"/);
});

test("reviews have no redundant product category gallery, but keep real article cards", () => {
  const reviews = read("components/reviews-hub.tsx");
  assert.doesNotMatch(reviews, /Čo chceš porovnať\?/);
  assert.match(reviews, /<ArticleCard/);
  assert.match(reviews, /portalSubpageHref\(section, category\)/);
});
