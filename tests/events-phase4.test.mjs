import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPublicEventPresentation, eventTypeFromPortalSlug, eventTypePortalHref, selectRelatedEvents } from "../lib/events.ts";

function event(overrides) {
  return {
    id: 1,
    slug: "podujatie",
    eventType: "Výstava",
    startDate: "2026-09-20",
    startTime: "09:00",
    endDate: null,
    endTime: null,
    cancelled: false,
    ...overrides,
  };
}

test("Events 2.0 detail keeps shared structural primitives and route-owned JSON-LD", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /PageContainer/);
  assert.match(detail, /<Breadcrumbs/);
  assert.match(detail, /data-event-detail-header/);
  assert.match(detail, /eventDateStatus\(event\)/);
  assert.doesNotMatch(detail, /application\/ld\+json|eventDateTimeIso/);
});

test("detail exposes real event fields before optional media and never renders empty sections", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  for (const label of ["Termín", "Miesto", "Organizátor", "Registrácia", "Oficiálna stránka"]) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /timeLabel && <span>/);
  assert.match(detail, /event\.registrationUrl && <PublicActionLink/);
  assert.match(detail, /event\.websiteUrl && <PublicActionLink/);
  assert.match(detail, /locationLines\.length > 0/);
  assert.match(detail, /event\.organizer &&/);
  assert.match(detail, /event\.description &&/);
  assert.match(detail, /event\.practicalInfo &&/);
  assert.match(detail, /event\.imageUrl && \([\s\S]*data-event-image/);
  assert.doesNotMatch(detail, /PawMark|Program|Poplatky|Podmienky účasti/);
});

test("PUBLIC-HYGIENE event presentation removes import diagnostics, raw sources and exact duplicate copy", () => {
  const presentation = buildPublicEventPresentation(event({
    excerpt: "Špeciálna výstava belgických ovčiakov.",
    description: "Špeciálna výstava belgických ovčiakov.",
    practicalInfo: [
      "Návštevníci: Nezistené – zdroj neurčuje režim návštevníkov",
      "Zdroje: https://kalendar.unkk.sk/",
      "source_id: import-0062",
      "Parkovanie: pri areáli.",
      "Návštevníci: vstup voľný.",
      "Zdroj: klubový bulletin.",
    ].join("\n"),
  }));

  assert.equal(presentation.description, "");
  assert.doesNotMatch(presentation.practicalInfo, /Nezistené|https:\/\/kalendar\.unkk\.sk|source_id/i);
  assert.match(presentation.practicalInfo, /Parkovanie: pri areáli/);
  assert.match(presentation.practicalInfo, /Návštevníci: vstup voľný/);
  assert.match(presentation.practicalInfo, /Zdroj: klubový bulletin/);
});

test("every public event type has a reversible crawlable listing route", () => {
  const routes = [
    ["Výstava", "/podujatia/vystavy", "vystavy"],
    ["Preteky", "/podujatia/preteky", "preteky"],
    ["Seminár", "/podujatia/seminare", "seminare"],
    ["Tréning", "/podujatia/treningy", "treningy"],
    ["Stretnutie", "/podujatia/stretnutia", "stretnutia"],
    ["Iné", "/podujatia/dalsie", "dalsie"],
  ];
  for (const [eventType, href, slug] of routes) {
    assert.equal(eventTypePortalHref(eventType), href);
    assert.equal(eventTypeFromPortalSlug(slug), eventType);
  }
});

test("internal discovery controls remain crawlable while directory pagination stays link-based", () => {
  const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
  const eventsPage = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
  const helpBrowser = readFileSync(new URL("../components/help-browser.tsx", import.meta.url), "utf8");
  const helpCategoryRoute = readFileSync(new URL("../app/pomoc-psom/[category]/page.tsx", import.meta.url), "utf8");
  const directoryResults = readFileSync(new URL("../components/directory-results.tsx", import.meta.url), "utf8");
  const relatedEntities = readFileSync(new URL("../components/related-entity-list.tsx", import.meta.url), "utf8");

  assert.match(calendar, /href=\{eventTimeFilterHref\(value, typePathname\)\}/);
  assert.match(eventsPage, /<PublicSubcategoryNavigator[\s\S]*mode="landing"/);
  assert.match(eventsPage, /<PublicSubcategoryNavigator[\s\S]*mode="compact"/);
  assert.match(eventsPage, /eventTypePortalHref\(eventType\)/);
  assert.doesNotMatch(calendar, /eventTypeFilters|selectType|className=\{styles\.typeBar\}/);
  assert.match(helpCategoryRoute, /rawSearchParams\.stav/);
  assert.match(helpBrowser, /href=\{statusHref\(!activeOnly\)\}/);
  assert.match(helpBrowser, /params\.set\("stav", "vsetky"\)/);
  assert.match(directoryResults, /<Link href=\{pageHref\(basePath, filters, result\.page - 1\)\}>← Predchádzajúca<\/Link>/);
  assert.match(directoryResults, /<Link href=\{pageHref\(basePath, filters, result\.page \+ 1\)\}>Ďalšia →<\/Link>/);
  assert.match(relatedEntities, /<Link className=\{styles\.card\} href=\{breed\.href\}>/);
});

test("EVENTS-PUBLIC-UX-1 keeps one dominant type navigation and one local event search", () => {
  const page = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/events-public.module.css", import.meta.url), "utf8");

  assert.match(page, /PublicSubcategoryNavigator/);
  assert.match(page, /mode="landing"/);
  assert.match(page, /mode="compact"/);
  assert.match(page, /PublicContextBanner/);
  assert.match(page, /ctaHref="\/podujatia\/pridat-podujatie"/);
  assert.doesNotMatch(page, /SectionHeroSearch|PublicCategoryTiles|searchSlot=/);
  assert.equal((calendar.match(/<input/g) ?? []).length, 1);
  assert.doesNotMatch(calendar, /eventTypeFilters|EVENT_SECTION_COPY|categoryOverview|selectType/);
  assert.match(calendar, /aria-expanded=\{filtersOpen\}/);
  assert.match(calendar, /id="event-secondary-filters"/);
  assert.match(calendar, /placeholder="Názov, mesto, miesto alebo organizátor"/);
  assert.match(css, /\.filterToggle[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.secondaryFilters[\s\S]*display:\s*none/);
  assert.match(css, /\.secondaryFiltersOpen[\s\S]*display:\s*grid/);
  assert.match(css, /\.timeBar[\s\S]*overflow-x:\s*auto/);
});

test("related events prefer active same-type events while past details prefer the nearest active events", () => {
  const today = "2026-09-09";
  const current = event({ id: 10, slug: "current", startDate: "2026-09-10", eventType: "Výstava" });
  const candidates = [
    event({ id: 2, slug: "old-show", startDate: "2026-09-01", eventType: "Výstava" }),
    event({ id: 3, slug: "race", startDate: "2026-09-11", eventType: "Preteky" }),
    event({ id: 4, slug: "show-later", startDate: "2026-09-20", eventType: "Výstava" }),
    event({ id: 5, slug: "show-sooner", startDate: "2026-09-15", eventType: "Výstava" }),
    event({ id: 6, slug: "cancelled", startDate: "2026-09-12", eventType: "Výstava", cancelled: true }),
  ];

  assert.deepEqual(
    selectRelatedEvents(current, candidates, 3, today).map((item) => item.slug),
    ["show-sooner", "show-later", "race"],
  );

  const past = event({ id: 20, slug: "past", startDate: "2026-09-01", eventType: "Výstava" });
  assert.deepEqual(
    selectRelatedEvents(past, candidates, 2, today).map((item) => item.slug),
    ["race", "show-sooner"],
  );
});

test("route keeps canonical metadata, truthful Event status/location and canonical page publisher without fake foreign Organization data", () => {
  const page = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /buildContentMetadata/);
  assert.match(page, /resolvedCanonical\(event\.seo,eventHref\(event\)\)|resolvedCanonical\(event\.seo, eventHref\(event\)\)/);
  assert.match(page, /"@type": "Event"/);
  assert.match(page, /"@type": "BreadcrumbList"/);
  assert.match(page, /position: 1, name: "Domov"/);
  assert.match(page, /position: 2, name: "Podujatia"/);
  assert.match(page, /eventDateTimeIso\(event\.startDate, event\.startTime\)/);
  assert.match(page, /event\.cancelled \? "https:\/\/schema\.org\/EventCancelled" : "https:\/\/schema\.org\/EventScheduled"/);
  assert.match(page, /location,/);
  assert.match(page, /buildWebPageJsonLd\(\{/);
  assert.match(page, /mainEntityOfPage: \{ "@id": canonical \}/);
  assert.match(page, /Do not invent a foreign Organization node/);
  assert.doesNotMatch(page, /organizer: \{ "@type": "Organization"/);
  assert.match(page, /url: canonical/);
  assert.doesNotMatch(page, /offers:|priceCurrency|ticket/);
  assert.match(page, /getUpcomingEvents\(8\)/);
  assert.match(page, /buildPublicEventPresentation\(storedEvent\)/);
  assert.match(page, /selectRelatedEvents\(event,/);
  assert.match(page, /<EventDetail event=\{event\} related=\{related\}/);
});

test("existing admin already manages every field needed by the public detail", () => {
  const editor = readFileSync(new URL("../components/admin-event-editor.tsx", import.meta.url), "utf8");
  for (const field of [
    "event-type", "event-start-date", "event-start-time", "event-end-date", "event-end-time",
    "event-region", "event-city", "event-venue", "event-address", "event-organizer",
    "event-description", "event-practical", "event-web", "event-registration",
  ]) {
    assert.match(editor, new RegExp('id="' + field + '"'));
  }
  assert.match(editor, /AdminSeoFields/);
});

test("detail uses scoped tokens, safe image cropping and mobile single-column fallbacks", () => {
  const css = readFileSync(new URL("../components/events-public.module.css", import.meta.url), "utf8");
  assert.match(css, /\.detailFacts[\s\S]*grid-template-columns:\s*repeat\(3/);
  assert.match(css, /\.detailVisual img[\s\S]*object-fit:\s*cover/);
  assert.match(css, /var\(--ps-space-section\)/);
  assert.match(css, /var\(--ps-border-soft\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.detailGrid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.detailFacts[\s\S]*grid-template-columns:\s*1fr/);
});
