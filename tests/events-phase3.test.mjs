import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalPage = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
const contentPage = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
const eventsPage = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
const eventCard = readFileSync(new URL("../components/event-card.tsx", import.meta.url), "utf8");
const eventsCss = readFileSync(new URL("../components/events-public.module.css", import.meta.url), "utf8");
const eventsLib = readFileSync(new URL("../lib/events.ts", import.meta.url), "utf8");
const eventStore = readFileSync(new URL("../lib/event-store.ts", import.meta.url), "utf8");
const adminEditor = readFileSync(new URL("../components/admin-event-editor.tsx", import.meta.url), "utf8");
const sitemapSeo = readFileSync(new URL("../lib/sitemap-seo.ts", import.meta.url), "utf8");

test("/podujatia remains the primary full event listing without mutating canonical records", () => {
  assert.match(portalPage, /slug === "podujatia" \? getPublishedEvents\(\)/);
  assert.match(portalPage, /slug === "podujatia"\) return <EventsPage/);
  assert.match(portalPage, /slug === "podujatia" \? getPublishedEventsInMonth\(calendarMonth\)/);
  assert.match(portalPage, /<EventsPage events=\{eventList\} calendarEvents=\{monthEvents \?\? \[\]\} initialCalendarMonth=\{calendarMonth\} initialDay=\{scalar\(rawSearchParams\.den\) \?\? ""\}/);
  assert.match(eventsPage, /<EventCalendar events=\{events\} calendarEvents=\{calendarEvents\} initialCalendarMonth=\{initialCalendarMonth\} initialDay=\{initialDay\} today=\{today\}/);
  assert.match(eventsPage, /calendarEvents\?: DogEvent\[\]/);
  assert.match(eventsPage, /initialCalendarMonth\?: string/);
  assert.match(eventsPage, /initialDay\?: string/);
  assert.match(eventsPage, /ctaHref="\/podujatia\/pridat-podujatie"/);
  assert.doesNotMatch(eventsPage, /createManagedEvent|updateManagedEvent|deleteManagedEvent/);
});

test("Events 2.0 removes the random photo hero and keeps data above the fold", () => {
  assert.match(eventsPage, /Kalendár a databáza/);
  assert.match(eventsPage, /activeCount/);
  assert.match(eventsPage, /eventDateStatus\(event, today\)/);
  assert.match(eventsPage, /<UnifiedSectionHero/);
  assert.doesNotMatch(eventsPage, /<SectionHero\b|heroImage|event-calendar-hero--photo/);
  assert.match(eventsPage, /getSectionHeroVisual\(isMainListing \|\| !categorySlug \? "section\.podujatia" : `events\.\$\{categorySlug\}`\)/);
  assert.match(eventsCss, /\.calendarSection[\s\S]*var\(--ps-space-section\)/);
});

test("event filters keep canonical page type, regions, date status, search and reliable month ranges", () => {
  assert.match(calendar, /const typePathname = initialType === "Všetky"/);
  assert.match(calendar, /eventTypePortalHref\(initialType\)/);
  assert.match(calendar, /slovakRegions\.map/);
  assert.match(calendar, /eventDateStatus\(event, today\)/);
  assert.match(calendar, /normalizeSearch/);
  assert.match(calendar, /monthKeysForEvent/);
  assert.match(calendar, /event\.startDate\.slice\(0, 7\) <= month/);
  assert.match(calendar, /initialType === "Všetky" \|\| event\.eventType === initialType/);
  assert.match(calendar, /Nenašli sme zhodu/);
  assert.match(calendar, /method="get"/);
  assert.match(calendar, /data-public-search-form="events"/);
  assert.match(calendar, /<PublicFilterDisclosure/);
  assert.doesNotMatch(calendar, /useState|useMemo|window\.history/);
  assert.doesNotMatch(calendar, /eventTypeFilters\.map|const eventTypes\s*=/);
});

test("root event types are page-owned and the calendar does not repeat them in overview groups", () => {
  assert.match(eventsPage, /eventTypes\.flatMap/);
  assert.match(eventsPage, /PublicSubcategoryNavigator/);
  assert.match(eventsPage, /mode="landing"/);
  assert.match(calendar, /className=\{styles\.eventList\} data-event-list/);
  assert.doesNotMatch(calendar, /items\.slice\(0, 5\)|data-event-category-overview|data-event-category=\{group\.eventType\}|Všetky výstavy|Všetky tréningy/);
});

test("default listing order keeps current and upcoming events ahead of past events", () => {
  assert.match(calendar, /function compareEvents/);
  assert.match(calendar, /status === "current"[\s\S]*return event\.cancelled \? 2 : 0/);
  assert.match(calendar, /status === "upcoming"[\s\S]*return event\.cancelled \? 2 : 1/);
  assert.match(calendar, /return event\.cancelled \? 4 : 3/);
  assert.match(calendar, /rightEnd\.localeCompare\(leftEnd\)/);
  assert.match(calendar, /\)\.sort\(\(left, right\) => compareEvents\(left, right, today\)\)/);
});

test("event rows stay compact and date-first while using canonical preview images when available", () => {
  assert.match(eventCard, /<time className=\{styles\.dateBlock\}/);
  assert.match(eventCard, /endDateLabel\(event\)/);
  assert.match(eventCard, /Čas/);
  assert.match(eventCard, /Miesto/);
  // Cards intentionally show the essential facts only; organizer remains available in the detail.
  assert.doesNotMatch(eventCard, /<strong>Organizátor<\\/strong>/);
  assert.match(eventCard, /event\\.region === "Online"/);
  assert.match(eventCard, /data-event-status/);
  assert.match(eventCard, /event\.imageUrl \? styles\.eventCardWithImage/);
  assert.match(eventCard, /<img src=\{event\.imageUrl\} alt="" loading="lazy" decoding="async"/);
  assert.doesNotMatch(eventCard, /PawMark/);
  assert.match(eventsCss, /grid-template-columns:\s*78px minmax\(0, 1fr\) auto/);
  assert.match(eventsCss, /\.eventCardWithImage[\s\S]*grid-template-columns:\s*78px 128px minmax\(0, 1fr\) auto/);
});

test("events keep shared public primitives while event-specific styles stay scoped", () => {
  assert.match(eventsPage, /Breadcrumbs, PageContainer/);
  assert.match(eventsPage, /<PageContainer/);
  assert.match(calendar, /PublicFilterDisclosure/);
  assert.match(calendar, /<form[\s\S]*className=\{styles\.toolbar\}[\s\S]*method="get"/);
  assert.match(eventsPage, /events-public\.module\.css/);
  assert.match(eventCard, /events-public\.module\.css/);
});

test("admin and public event filters continue to share canonical eventTypes", () => {
  assert.match(eventsLib, /export const eventTypes =/);
  assert.match(eventsLib, /export const eventTypeFilters =/);
  assert.match(adminEditor, /import \{ eventTypes, slovakRegions/);
  assert.match(adminEditor, /eventTypes\.map/);
  assert.match(adminEditor, /slovakRegions\.map/);
});

test("legacy calendar URL stays a noindex canonical alias excluded from sitemap", () => {
  assert.match(contentPage, /slug === "kalendar"[\s\S]*canonical: "\/podujatia"/);
  assert.match(contentPage, /robots: \{ index: false, follow: true \}/);
  assert.match(contentPage, /if \(section === "podujatia" && slug === "kalendar"\) \{\s*const rawSearchParams = await searchParams;/);
  assert.match(contentPage, /const calendarMonth = resolveCalendarMonth\(eventMonthFilterFromParam\(rawSearchParams\.kalendar\), eventMonthFilterFromParam\(rawSearchParams\.mesiac\), bratislavaDateKey\(\)\)/);
  assert.match(contentPage, /const \[events, calendarEvents\] = await Promise\.all\(\[getPublishedEvents\(\), getPublishedEventsInMonth\(calendarMonth\)\]\)/);
  assert.match(contentPage, /return <EventsPage events=\{events\} calendarEvents=\{calendarEvents\} initialCalendarMonth=\{calendarMonth\} initialDay=\{scalar\(rawSearchParams\.den\) \?\? ""\}/);
  assert.doesNotMatch(contentPage, /permanentRedirect\("\/podujatia"\)/);
  assert.match(sitemapSeo, /"\/podujatia\/kalendar"/);
});

test("calendar data is month-scoped, publication-only and read-only", () => {
  assert.match(eventStore, /export async function getPublishedEventsInMonth\(month: string\)/);
  assert.match(eventStore, /if \(!\/\^20\\d\{2\}-\(\?:0\[1-9\]\|1\[0-2\]\)\$\/\.test\(month\)\) return \[\] as DogEvent\[\]/);
  assert.match(eventStore, /const monthEnd = `\$\{month\}-\$\{String\(lastDay\)\.padStart\(2, "0"\)\}`/);
  assert.match(eventStore, /status = 'published' AND start_date <= \? AND COALESCE\(end_date, start_date\) >= \?/);
  assert.match(eventStore, /\.bind\(monthEnd, `\$\{month\}-01`\)\.all<EventRow>\(\)/);
  assert.match(eventStore, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT 500/);
  assert.doesNotMatch(eventStore.slice(eventStore.indexOf("export async function getPublishedEventsInMonth"), eventStore.indexOf("export async function getUpcomingEvents")), /\b(?:UPDATE|DELETE|INSERT)\s+managed_events\b|createManagedEvent|updateManagedEvent|deleteManagedEvent/);
  assert.match(calendar, /const monthMatches = calendarEvents\.filter\(matchesFilters\)/);
  assert.match(calendar, /eventsForCalendarDay\(monthMatches, selectedDay\)/);
  assert.doesNotMatch(calendar, /\.push\(event\)|Object\.assign\(event|event\.(?:status|startDate|endDate)\s*=/);
});

test("event routes restore search and secondary filters from the URL", () => {
  assert.match(portalPage, /initialTime=\{eventTimeFilterFromParam\(rawSearchParams\.termin\)\}/);
  assert.match(portalPage, /initialQuery=\{eventSearchQueryFromParam\(rawSearchParams\.q\)\}/);
  assert.match(portalPage, /initialRegion=\{eventRegionFilterFromParam\(rawSearchParams\.region\)\}/);
  assert.match(portalPage, /initialMonth=\{eventMonthFilterFromParam\(rawSearchParams\.mesiac\)\}/);
  assert.match(contentPage, /eventTypeFromPortalSlug\(slug\)[\s\S]*initialTime=\{eventTimeFilterFromParam\(rawSearchParams\.termin\)\}/);
  assert.match(contentPage, /initialQuery=\{eventSearchQueryFromParam\(rawSearchParams\.q\)\}/);
  assert.match(contentPage, /initialRegion=\{eventRegionFilterFromParam\(rawSearchParams\.region\)\}/);
  assert.match(contentPage, /initialMonth=\{eventMonthFilterFromParam\(rawSearchParams\.mesiac\)\}/);
});
