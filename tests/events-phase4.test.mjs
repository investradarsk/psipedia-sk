import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEventJsonLd } from "../lib/event-schema.ts";
import {
  buildPublicEventPresentation,
  eventTypeFromPortalSlug,
  eventTypePortalHref,
  selectRelatedEvents,
} from "../lib/events.ts";

function event(overrides) {
  return {
    id: 1,
    slug: "podujatie",
    title: "Klubová výstava",
    excerpt: "Verejný popis podujatia.",
    eventType: "Výstava",
    status: "published",
    startDate: "2026-09-20",
    startTime: "09:00",
    endDate: null,
    endTime: null,
    venue: "Výstavisko",
    city: "Nitra",
    region: "Nitriansky kraj",
    address: "Výstavná 1",
    organizer: "Klub test",
    description: "Verejný popis podujatia.",
    practicalInfo: "",
    websiteUrl: "https://example.org/event",
    registrationUrl: null,
    imageUrl: "/images/event.webp",
    imageKey: null,
    cancelled: false,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    publishedAt: "2026-08-05T10:00:00.000Z",
    createdBy: "editor",
    updatedBy: "editor",
    ...overrides,
  };
}

test("Events 2.0 detail keeps shared structural primitives and route-owned JSON-LD", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /PageContainer/);
  assert.match(detail, /<Breadcrumbs/);
  assert.match(detail, /<DetailHero\s*kind="event"/);
  const hero = readFileSync(
    new URL("../components/detail-primitives/detail-primitives.tsx", import.meta.url),
    "utf8",
  );
  assert.match(hero, /data-event-detail-header=\{\s*kind\s*===\s*"event"/);
  assert.match(detail, /eventDateStatus\(\s*event\s*\)/);
  assert.doesNotMatch(detail, /application\/ld\+json|eventDateTimeIso/);
});

test("detail exposes real event fields before optional media and never renders empty sections", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  for (const label of ["Termín", "Miesto", "Organizátor", "Registrácia", "Oficiálna stránka"]) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /timeLabel\s*&&\s*<span>/);
  assert.match(
    detail,
    /showRegistration\s*&&\s*event\s*\.registrationUrl\s*&&\s*\(\s*<PublicActionLink/,
  );
  assert.match(detail, /event\s*\.websiteUrl\s*&&\s*\(\s*<PublicActionLink/);
  assert.match(detail, /<dl\s*className=\{\s*detailStyles\s*\.factTiles\s*\}/);
  assert.match(detail, /locationLines\s*\.map/);
  assert.doesNotMatch(detail, /<DetailFactsCard/);
  assert.match(detail, /event\s*\.organizer\s*&&/);
  assert.match(detail, /event\s*\.description\s*&&/);
  assert.match(detail, /event\s*\.practicalInfo\s*&&/);
  assert.match(
    detail,
    /media=\{\s*<EventImage\s*imageUrl=\{\s*event\s*\.imageUrl\s*\}\s*eventId=\{\s*event\s*\.id\s*\}\s*eventType=\{\s*event\s*\.eventType\s*\}/,
  );
  assert.doesNotMatch(detail, /PawMark|Program|Poplatky|Podmienky\s*účasti/);
});

test("PUBLIC-HYGIENE event presentation removes import diagnostics, raw sources and exact duplicate copy", () => {
  const presentation = buildPublicEventPresentation(
    event({
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
    }),
  );

  assert.equal(presentation.description, "");
  assert.doesNotMatch(
    presentation.practicalInfo,
    /Nezistené|https:\/\/kalendar\s*\.unkk\s*\.sk|source_id/i,
  );
  assert.match(presentation.practicalInfo, /Parkovanie:\s*pri\s*areáli/);
  assert.match(presentation.practicalInfo, /Návštevníci:\s*vstup\s*voľný/);
  assert.match(presentation.practicalInfo, /Zdroj:\s*klubový\s*bulletin/);
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

test("internal category navigation remains crawlable while directory pagination stays link-based", () => {
  const calendar = readFileSync(
    new URL("../components/event-calendar.tsx", import.meta.url),
    "utf8",
  );
  const eventsPage = readFileSync(
    new URL("../components/events-page.tsx", import.meta.url),
    "utf8",
  );
  const helpBrowser = readFileSync(
    new URL("../components/help-browser.tsx", import.meta.url),
    "utf8",
  );
  const helpCategoryRoute = readFileSync(
    new URL("../app/pomoc-psom/[category]/page.tsx", import.meta.url),
    "utf8",
  );
  const directoryResults = readFileSync(
    new URL("../components/directory-results.tsx", import.meta.url),
    "utf8",
  );
  const relatedEntities = readFileSync(
    new URL("../components/related-entity-list.tsx", import.meta.url),
    "utf8",
  );

  // The shared category navigator renders real anchors from these href items,
  // while the click handler retains the in-place calendar state transition.
  assert.match(calendar, /href:\s*timeHref\(value\)/);
  assert.match(calendar, /<PublicSubcategoryNavigator/);
  assert.match(calendar, /clickNavigate\(event,\s*timeHref\(value\)/);
  assert.match(readFileSync(new URL("../components/public-visual-system/public-subcategory-navigator.tsx", import.meta.url), "utf8"), /<Link[\s\S]*?href=\{item\.href\}/);
  assert.match(eventsPage, /shortcuts=\{\[\]\}/);
  assert.match(
    eventsPage,
    /items=\{eventTypes\.map\(\(type\)\s*=>\s*\(\{/,
  );
  assert.match(eventsPage, /eventTypePortalHref\(\s*type\s*\)/);
  assert.match(calendar, /data-events-legend/);
  assert.match(calendar, /eventTypePortalHref\(\s*type\s*\)/);
  assert.doesNotMatch(
    calendar,
    /eventTypeFilters|selectType|className=\{\s*styles\s*\.typeBar\s*\}/,
  );
  assert.match(helpCategoryRoute, /rawSearchParams\s*\.stav/);
  assert.match(helpBrowser, /name="stav"/);
  assert.match(helpBrowser, /value="vsetky">Aj\s*ukončené/);
  assert.doesNotMatch(helpBrowser, /useState|window\s*\.history/);
  // The directory supplies filter-preserving canonical hrefs, while the shared
  // server-rendered pagination owns native rel=prev/next links for crawlers.
  const pagination = readFileSync(
    new URL("../components/public-visual-system/public-result-states.tsx", import.meta.url),
    "utf8",
  );
  assert.match(directoryResults, /<PublicPagination\b/);
  assert.match(directoryResults, /currentPage=\{\s*result\s*\.page\s*\}/);
  assert.match(directoryResults, /totalPages=\{\s*result\s*\.totalPages\s*\}/);
  assert.match(
    directoryResults,
    /previousHref=\{\s*result\s*\.page\s*>\s*1\s*\?\s*directoryPageHref\(\s*basePath,\s*filters,\s*result\s*\.page\s*-\s*1\s*\)\s*\+\s*"#directory-results-heading"\s*:\s*undefined\s*\}/,
  );
  assert.match(
    directoryResults,
    /nextHref=\{\s*result\s*\.page\s*<\s*result\s*\.totalPages\s*\?\s*directoryPageHref\(\s*basePath,\s*filters,\s*result\s*\.page\s*\+\s*1\s*\)\s*\+\s*"#directory-results-heading"\s*:\s*undefined\s*\}/,
  );
  assert.match(
    pagination,
    /<Link[^>]*href=\{previousHref\} rel="prev" aria-label=\{previousAriaLabel \?\? previousLabel\}>‹<\/Link>/,
  );
  assert.match(
    pagination,
    /<Link[^>]*href=\{nextHref\} rel="next" aria-label=\{nextAriaLabel \?\? nextLabel\}>›<\/Link>/,
  );
  assert.match(
    relatedEntities,
    /<Link\s*className=\{\s*styles\s*\.card\s*\}\s*href=\{\s*breed\s*\.href\s*\}>/,
  );
});

test("EVENTS-PUBLIC-UX-1 keeps one search with crawlable compact category links", () => {
  const page = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
  const calendar = readFileSync(
    new URL("../components/event-calendar.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../components/events-public.module.css", import.meta.url),
    "utf8",
  );

  assert.match(page, /<PublicSubcategoryNavigator/);
  assert.match(calendar, /data-events-legend/);
  assert.match(page, /shortcuts=\{\[\]\}/);
  assert.match(
    page,
    /items=\{eventTypes\.map\(\(type\)\s*=>\s*\(\{/,
  );
  assert.match(page, /eventTypePortalHref\(\s*type\s*\)/);
  assert.match(calendar, /eventTypePortalHref\(\s*type\s*\)/);
  // Active state follows client-side calendar selection, not initial SSR props.
  assert.match(calendar, /aria-current=\{\s*view\s*\.type\s*===\s*type/);
  assert.match(calendar, /data-events-legend/);
  assert.match(page, /PublicContextBanner/);
  assert.match(page, /ctaHref="\/podujatia\/pridat-podujatie"/);
  assert.doesNotMatch(page, /SectionHeroSearch|PublicCategoryTiles|searchSlot=/);
  assert.equal((page.match(/<HomePortalSearch/g) ?? []).length, 1);
  assert.match(page, /searchScope="events"/);
  assert.equal((page.match(/id="events-search"/g) ?? []).length, 1);
  const results = readFileSync(
    new URL("../components/event-listing-results.tsx", import.meta.url),
    "utf8",
  );
  assert.match(results, /eventListingParams/);
  assert.doesNotMatch(calendar, /eventTypeFilters|EVENT_SECTION_COPY|categoryOverview|selectType/);
  assert.match(results, /<details/);
  assert.match(results, /aria-controls="events-filter-panel"/);
  assert.match(results, /className=\{\s*styles\s*\.sidebarContent\s*\}/);
  assert.match(
    page,
    /placeholder="Názov\s*podujatia,\s*mesto,\s*miesto\s*alebo\s*organizátor\s*\.\s*\.\s*\."/,
  );
  assert.match(css, /\s*\.filterToggle[\s\S]*min-height:\s*44px/);
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*760px\s*\)[\s\S]*\s*\.secondaryFilters[\s\S]*display:\s*none/,
  );
  assert.match(css, /\s*\.secondaryFiltersOpen[\s\S]*display:\s*grid/);
  assert.match(css, /\s*\.timeBar[\s\S]*overflow-x:\s*auto/);
});

test("related events prefer active same-type events while past details prefer the nearest active events", () => {
  const today = "2026-09-09";
  const current = event({ id: 10, slug: "current", startDate: "2026-09-10", eventType: "Výstava" });
  const candidates = [
    event({ id: 2, slug: "old-show", startDate: "2026-09-01", eventType: "Výstava" }),
    event({ id: 3, slug: "race", startDate: "2026-09-11", eventType: "Preteky" }),
    event({ id: 4, slug: "show-later", startDate: "2026-09-20", eventType: "Výstava" }),
    event({ id: 5, slug: "show-sooner", startDate: "2026-09-15", eventType: "Výstava" }),
    event({
      id: 6,
      slug: "cancelled",
      startDate: "2026-09-12",
      eventType: "Výstava",
      cancelled: true,
    }),
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

test("route reuses the canonical Event graph builder without duplicating schema in the page", () => {
  const page = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  const schemaBuilder = readFileSync(new URL("../lib/event-schema.ts", import.meta.url), "utf8");
  assert.match(page, /buildContentMetadata/);
  assert.match(
    page,
    /resolvedCanonical\(\s*event\s*\.seo,\s*eventHref\(\s*event\s*\)\s*\)|resolvedCanonical\(\s*event\s*\.seo,\s*eventHref\(\s*event\s*\)\s*\)/,
  );
  assert.match(page, /buildEventJsonLd\(\s*event,\s*canonical\s*\)/);
  assert.doesNotMatch(page, /"@type":\s*"Event"/);
  assert.match(schemaBuilder, /"@type":\s*"Event"/);
  assert.match(schemaBuilder, /"@type":\s*"BreadcrumbList"/);
  assert.match(schemaBuilder, /buildWebPageJsonLd\(\s*\{\s*/);
  assert.match(schemaBuilder, /mainEntityOfPage:\s*\{\s*"@id":\s*canonical\s*\}/);
  assert.match(schemaBuilder, /Do\s*not\s*invent\s*a\s*foreign\s*Person\/Organization\s*entity/);
  assert.doesNotMatch(schemaBuilder, /organizer:\s*\{\s*"@type":\s*"Organization"/);
  assert.doesNotMatch(schemaBuilder, /\boffers\s*:|\bpriceCurrency\s*:|\bticket\s*:/);
  assert.match(page, /getUpcomingEventCards\(\s*8\s*\)/);
  assert.match(page, /buildPublicEventPresentation\(\s*storedEvent\s*\)/);
  assert.match(page, /selectRelatedEvents\(\s*event,\s*/);
  assert.match(page, /<EventDetail\s*event=\{\s*event\s*\}\s*related=\{\s*related\s*\}/);
});

test("Event graph covers physical, online and registration-free events with canonical dates", () => {
  const physical = buildEventJsonLd(
    event({ registrationUrl: null }),
    "https://psipedia.sk/podujatia/klubova-vystava",
  );
  const physicalEvent = physical["@graph"].find((item) => item["@type"] === "Event");
  const physicalPage = physical["@graph"].find((item) => item["@type"] === "WebPage");
  assert.equal(physicalEvent.location["@type"], "Place");
  assert.equal(physicalEvent.location.address.addressLocality, "Nitra");
  assert.equal(physicalEvent.startDate, "2026-09-20T09:00:00+02:00");
  assert.equal("registrationUrl" in physicalEvent, false);
  assert.equal("offers" in physicalEvent, false);
  assert.equal(physicalPage.datePublished, "2026-08-05T10:00:00.000Z");
  assert.equal(physicalPage.dateModified, "2026-09-01T10:00:00.000Z");
  assert.deepEqual(physicalPage.mainEntity, {
    "@id": "https://psipedia.sk/podujatia/klubova-vystava#event",
  });

  const online = buildEventJsonLd(
    event({
      slug: "online-webinar",
      region: "Online",
      city: "",
      venue: "",
      address: "",
      websiteUrl: "https://example.org/webinar",
      registrationUrl: null,
    }),
    "/podujatia/online-webinar",
  );
  const onlineEvent = online["@graph"].find((item) => item["@type"] === "Event");
  assert.deepEqual(onlineEvent.location, {
    "@type": "VirtualLocation",
    url: "https://example.org/webinar",
  });
  assert.equal(onlineEvent.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
});

test("existing admin already manages every field needed by the public detail", () => {
  const editor = readFileSync(
    new URL("../components/admin-event-editor.tsx", import.meta.url),
    "utf8",
  );
  for (const field of [
    "event-type",
    "event-start-date",
    "event-start-time",
    "event-end-date",
    "event-end-time",
    "event-region",
    "event-city",
    "event-venue",
    "event-address",
    "event-organizer",
    "event-description",
    "event-practical",
    "event-web",
    "event-registration",
  ]) {
    assert.match(editor, new RegExp('id="' + field + '"'));
  }
  assert.match(editor, /AdminSeoFields/);
});

test("detail uses scoped tokens, safe image cropping and mobile single-column fallbacks", () => {
  const css = readFileSync(
    new URL("../components/events-public.module.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\s*\.detailFacts[\s\S]*grid-template-columns:\s*repeat\(\s*3/);
  assert.match(css, /\s*\.detailVisual\s*img[\s\S]*object-fit:\s*cover/);
  assert.match(css, /var\(\s*--ps-space-section\s*\)/);
  assert.match(css, /var\(\s*--ps-border-soft\s*\)/);
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*760px\s*\)[\s\S]*\s*\.detailGrid[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*900px\s*\)[\s\S]*\s*\.detailFacts[\s\S]*grid-template-columns:\s*1fr/,
  );
});
