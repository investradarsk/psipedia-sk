import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalPage = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
const contentPage = readFileSync(
  new URL("../app/[section]/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const listing = readFileSync(
  new URL("../components/event-listing-results.tsx", import.meta.url),
  "utf8",
);
const filters = readFileSync(new URL("../lib/event-listing.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
const eventsPage = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
const eventCard = readFileSync(new URL("../components/event-card.tsx", import.meta.url), "utf8");
const eventsCss = readFileSync(
  new URL("../components/events-public.module.css", import.meta.url),
  "utf8",
);
const eventsLib = readFileSync(new URL("../lib/events.ts", import.meta.url), "utf8");
const eventStore = readFileSync(new URL("../lib/event-store.ts", import.meta.url), "utf8");
const adminEditor = readFileSync(
  new URL("../components/admin-event-editor.tsx", import.meta.url),
  "utf8",
);
const sitemapSeo = readFileSync(new URL("../lib/sitemap-seo.ts", import.meta.url), "utf8");

test("/podujatia remains the primary full event listing without mutating canonical records", () => {
  assert.match(portalPage, /slug === "podujatia" \? getPublishedEventListing\(parseEventListing/);
  assert.match(portalPage, /slug === "podujatia"\) return <EventsPage/);
  assert.match(portalPage, /slug === "podujatia" \? getPublicEventCalendar/);
  assert.match(
    portalPage,
    /<EventsPage[\s\S]*events=\{eventList\}[\s\S]*calendarSummaries=\{monthEvents\?\.summaries\}/,
  );
  assert.match(
    eventsPage,
    /<EventCalendar[\s\S]*events=\{events\}[\s\S]*calendarSummaries=\{calendarSummaries\}[\s\S]*today=\{today\}/,
  );
  assert.match(eventsPage, /calendarEvents\?: PublicEventDayPreview\[\]/);
  assert.match(eventsPage, /initialCalendarMonth\?: string/);
  assert.match(eventsPage, /initialDay\?: string/);
  assert.match(eventsPage, /ctaHref="\/podujatia\/pridat-podujatie"/);
  assert.doesNotMatch(eventsPage, /createManagedEvent|updateManagedEvent|deleteManagedEvent/);
});

test("Events 2.0 presents calendar after managed hero, with shared date filtering", () => {
  assert.match(eventsPage, /Kalendár a databáza/);
  // UX-V2 intentionally removes the redundant hero count in favor of immediate calendar access.
  assert.doesNotMatch(eventsPage, /metaSlot=\{/);
  assert.doesNotMatch(eventsPage, /activeCount/);
  assert.match(
    eventsPage,
    /<EventCalendar[\s\S]*events=\{events\}[\s\S]*calendarEvents=\{calendarEvents\}/,
  );
  assert.ok(
    eventsPage.indexOf("<UnifiedSectionHero") <
      eventsPage.indexOf("className={styles.calendarSection}"),
  );
  assert.match(eventCard, /eventDateStatus\(event, today\)/);
  assert.match(eventsPage, /<UnifiedSectionHero/);
  assert.doesNotMatch(eventsPage, /<SectionHero\b|heroImage|event-calendar-hero--photo/);
  assert.match(
    eventsPage,
    /getSectionHeroVisual\(isMainListing \|\| !categorySlug \? "section\.podujatia" : `events\.\$\{categorySlug\}`\)/,
  );
  assert.match(eventsCss, /\.calendarSection[\s\S]*var\(--ps-space-section\)/);
});

test("event filters keep canonical page type, regions, date status, search and reliable month ranges", () => {
  assert.match(calendar, /const typePathname = view.type === "Všetky"/);
  assert.match(calendar, /eventTypePortalHref\(view.type\)/);
  assert.match(listing, /slovakRegions\s*\.filter/);
  assert.match(eventCard, /eventDateStatus\(event, today\)/);
  assert.match(filters, /normalizeEventSearch/);
  assert.match(filters, /calendarMonthBounds/);
  assert.match(filters, /start_date <= \? AND/);
  assert.match(filters, /event_type = \?/);
  assert.match(listing, /Nenašli sme zhodu/);
  assert.match(listing, /method="get"/);
  assert.match(eventsPage, /searchScope="events"/);
  assert.match(listing, /<details/);
  // Approved UX: month/type/time changes update only calendar data, not the hero.
  assert.ok(calendar.includes("useState<View>"));
  assert.ok(calendar.includes('window.history.pushState(window.history.state,"",href)'));
  assert.ok(calendar.includes('window.addEventListener("popstate",restore)'));
  assert.ok(calendar.includes('requestRef.current?.abort()'));
  assert.ok(calendar.includes('fetch(endpoint.toString(),{signal:controller.signal'));
  assert.doesNotMatch(calendar, /eventTypeFilters\.map|const eventTypes\s*=/);
});

test("event categories link from search shortcuts and calendar legend without duplicate overview cards", () => {
  assert.match(eventsPage, /eventTypes\.filter/);
  assert.match(eventsPage, /shortcuts=\{searchShortcuts\}/);
  assert.match(calendar, /eventTypePortalHref\(type\)/);
  assert.doesNotMatch(eventsPage, /PublicSubcategoryNavigator/);
  assert.match(calendar, /data-events-legend/);
  assert.match(listing, /className=\{styles\.cardGrid\} data-event-list/);
  assert.doesNotMatch(
    calendar,
    /items\.slice\(0, 5\)|data-event-category-overview|data-event-category=\{group\.eventType\}|Všetky výstavy|Všetky tréningy/,
  );
});

test("default listing order keeps current and upcoming events ahead of past events", () => {
  assert.match(filters, /cancelled = 1 THEN 4 ELSE 3/);
  assert.match(filters, /cancelled = 1 THEN 2/);
  assert.match(filters, /THEN 0 ELSE 1/);
  assert.match(filters, /start_time END DESC/);
  assert.match(eventStore, /ORDER BY \$\{sql.order\} LIMIT \? OFFSET \?/);
});

test("event rows stay compact and date-first with an image presentation slot", () => {
  assert.match(eventCard, /<time className=\{styles\.dateBlock\}/);
  assert.match(eventCard, /endDateLabel\(event\)/);
  assert.match(eventCard, /Čas/);
  assert.match(eventCard, /Miesto/);
  // Cards intentionally show the essential facts only; organizer remains available in the detail.
  assert.doesNotMatch(eventCard, /<strong>Organizátor<\/strong>/);
  assert.doesNotMatch(eventCard, /Online podujatie/);
  assert.match(eventCard, /data-event-status/);
  assert.match(eventCard, /styles\.eventCardWithImage/);
  assert.match(
    eventCard,
    /<EventImage imageUrl=\{event\.imageUrl\} eventType=\{event\.eventType\} mode=\{event\.imageDisplay\} config=\{event\.thumbnailImageDisplay\} sizes="[^"]+" alt="" loading="lazy" decoding="async"/,
  );
  assert.doesNotMatch(eventCard, /PawMark/);
  assert.match(eventsCss, /grid-template-columns:\s*78px minmax\(0, 1fr\) auto/);
  assert.match(
    eventsCss,
    /\.eventCardWithImage[\s\S]*grid-template-columns:\s*78px 128px minmax\(0, 1fr\) auto/,
  );
});

test("events keep shared public primitives while event-specific styles stay scoped", () => {
  assert.match(eventsPage, /import \{ Breadcrumbs \} from "@\/components\/page-system"/);
  assert.match(eventsPage, /<UnifiedSectionHeroShell/);
  assert.match(eventsPage, /portalSearchSlot=/);
  assert.match(listing, /<details/);
  assert.match(listing, /<form method="get" action=\{`\$\{pathname\}#events-list`\}/);
  assert.match(eventsPage, /events-public\.module\.css/);
  assert.match(eventCard, /events-public\.module\.css/);
});

test("admin and public event filters continue to share canonical eventTypes", () => {
  assert.match(eventsLib, /export const eventTypes =/);
  assert.match(eventsLib, /export const eventTypeFilters =/);
  assert.match(adminEditor, /import \{ eventTypes, slovakRegions/);
  assert.match(adminEditor, /eventTypes\.map/);
  assert.match(adminEditor, /slovakRegions\s*\.filter/);
});

test("legacy calendar URL stays a noindex canonical alias excluded from sitemap", () => {
  assert.match(contentPage, /slug === "kalendar"[\s\S]*canonical: "\/podujatia"/);
  assert.match(contentPage, /robots: \{ index: false, follow: true \}/);
  assert.match(
    contentPage,
    /if \(section === "podujatia" && slug === "kalendar"\) \{\s*const rawSearchParams = await searchParams;/,
  );
  assert.match(
    contentPage,
    /const calendarMonth = resolveCalendarMonth\(eventMonthFilterFromParam\(rawSearchParams\.kalendar\), eventMonthFilterFromParam\(rawSearchParams\.mesiac\), bratislavaDateKey\(\)\)/,
  );
  assert.match(
    contentPage,
    /const \[events, calendarEvents\] = await Promise\.all\(\[getPublishedEventListing/,
  );
  assert.match(
    contentPage,
    /return <EventsPage listing=\{events\}[\s\S]*calendarSummaries=\{calendarEvents.summaries\}/,
  );
  assert.doesNotMatch(contentPage, /permanentRedirect\("\/podujatia"\)/);
  assert.match(sitemapSeo, /"\/podujatia\/kalendar"/);
});

test("calendar data is month-scoped, publication-only and read-only", () => {
  assert.match(eventStore, /export async function getPublishedEventsInMonth\(month: string\)/);
  assert.match(
    eventStore,
    /if \(!\/\^20\\d\{2\}-\(\?:0\[1-9\]\|1\[0-2\]\)\$\/\.test\(month\)\) return \[\] as DogEvent\[\]/,
  );
  assert.match(
    eventStore,
    /const monthEnd = `\$\{month\}-\$\{String\(lastDay\)\.padStart\(2, "0"\)\}`/,
  );
  assert.match(
    eventStore,
    /status = 'published' AND start_date <= \? AND COALESCE\(end_date, start_date\) >= \?/,
  );
  assert.match(eventStore, /\.bind\(monthEnd, `\$\{month\}-01`\)\.all<EventRow>\(\)/);
  assert.match(eventStore, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT 500/);
  assert.doesNotMatch(
    eventStore.slice(
      eventStore.indexOf("export async function getPublishedEventsInMonth"),
      eventStore.indexOf("export async function getUpcomingEvents"),
    ),
    /\b(?:UPDATE|DELETE|INSERT)\s+managed_events\b|createManagedEvent|updateManagedEvent|deleteManagedEvent/,
  );
  // Selected-day events now come from the latest scoped JSON response.
  assert.ok(calendar.includes("eventsForCalendarDay(data.calendarEvents,selectedDay)"));
  const ajax = readFileSync(new URL("../app/api/public/events/calendar/route.ts", import.meta.url), "utf8");
  assert.ok(ajax.includes("getPublicEventCalendar(filters, month, day)"));
  assert.ok(ajax.includes("getPublishedEventListing(filters)"));
  assert.ok(ajax.includes("calendarSummaries: calendar.summaries"));
  assert.ok(ajax.includes('"Cache-Control": "private, no-store"'));
  assert.doesNotMatch(
    calendar,
    /\.push\(event\)|Object\.assign\(event|event\.(?:status|startDate|endDate)\s*=/,
  );
});

test("event routes restore search and secondary filters from the URL", () => {
  assert.match(portalPage, /initialTime=\{eventTimeFilterFromParam\(rawSearchParams\.termin\)\}/);
  assert.match(portalPage, /initialQuery=\{eventSearchQueryFromParam\(rawSearchParams\.q\)\}/);
  assert.match(
    portalPage,
    /initialRegion=\{eventRegionFilterFromParam\(rawSearchParams\.region\)\}/,
  );
  assert.match(portalPage, /initialMonth=\{eventMonthFilterFromParam\(rawSearchParams\.mesiac\)\}/);
  assert.match(
    contentPage,
    /eventTypeFromPortalSlug\(slug\)[\s\S]*initialTime=\{eventTimeFilterFromParam\(rawSearchParams\.termin\)\}/,
  );
  assert.match(contentPage, /initialQuery=\{eventSearchQueryFromParam\(rawSearchParams\.q\)\}/);
  assert.match(
    contentPage,
    /initialRegion=\{eventRegionFilterFromParam\(rawSearchParams\.region\)\}/,
  );
  assert.match(
    contentPage,
    /initialMonth=\{eventMonthFilterFromParam\(rawSearchParams\.mesiac\)\}/,
  );
});
