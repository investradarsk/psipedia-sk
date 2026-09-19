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
const adminEditor = readFileSync(new URL("../components/admin-event-editor.tsx", import.meta.url), "utf8");
const sitemapSeo = readFileSync(new URL("../lib/sitemap-seo.ts", import.meta.url), "utf8");

test("/podujatia remains the primary full event listing without mutating canonical records", () => {
  assert.match(portalPage, /slug === "podujatia" \? getPublishedEvents\(\)/);
  assert.match(portalPage, /slug === "podujatia"\) return <EventsPage/);
  assert.match(eventsPage, /<EventCalendar events=\{events\} today=\{today\}/);
  assert.match(eventsPage, /href="\/podujatia\/pridat-podujatie"/);
  assert.doesNotMatch(eventsPage, /createManagedEvent|updateManagedEvent|deleteManagedEvent/);
});

test("Events 2.0 removes the random photo hero and keeps data above the fold", () => {
  assert.match(eventsPage, /Kalendár a databáza/);
  assert.match(eventsPage, /activeCount/);
  assert.match(eventsPage, /eventDateStatus\(event, today\)/);
  assert.doesNotMatch(eventsPage, /SectionHero|heroImage|event-calendar-hero--photo|trening-pri-nohe/);
  assert.match(eventsCss, /\.pageHeader[\s\S]*padding:\s*24px 0 22px/);
});

test("event filters use canonical types, regions, date status, search and reliable month ranges", () => {
  assert.match(calendar, /eventTypeFilters\.map/);
  assert.match(calendar, /slovakRegions\.map/);
  assert.match(calendar, /eventDateStatus\(event, today\)/);
  assert.match(calendar, /normalizeSearch/);
  assert.match(calendar, /monthKeysForEvent/);
  assert.match(calendar, /event\.startDate\.slice\(0, 7\) <= month/);
  assert.match(calendar, /Nenašli sme zhodu/);
  assert.match(calendar, /resetFilters/);
  assert.doesNotMatch(calendar, /const eventTypes\s*=/);
});

test("default listing order keeps current and upcoming events ahead of past events", () => {
  assert.match(calendar, /function compareEvents/);
  assert.match(calendar, /status === "current"[\s\S]*return event\.cancelled \? 2 : 0/);
  assert.match(calendar, /status === "upcoming"[\s\S]*return event\.cancelled \? 2 : 1/);
  assert.match(calendar, /return event\.cancelled \? 4 : 3/);
  assert.match(calendar, /rightEnd\.localeCompare\(leftEnd\)/);
  assert.match(calendar, /result\.sort\(\(left, right\) => compareEvents\(left, right, today\)\)/);
});

test("event rows are compact, date-first and image-free on the listing", () => {
  assert.match(eventCard, /<time className=\{styles\.dateBlock\}/);
  assert.match(eventCard, /endDateLabel\(event\)/);
  assert.match(eventCard, /Čas/);
  assert.match(eventCard, /Miesto/);
  assert.match(eventCard, /Organizátor/);
  assert.match(eventCard, /data-event-status/);
  assert.doesNotMatch(eventCard, /event\.imageUrl|<img|PawMark/);
  assert.match(eventsCss, /grid-template-columns:\s*78px minmax\(0, 1fr\) auto/);
});

test("events keep shared public primitives while event-specific styles stay scoped", () => {
  assert.match(eventsPage, /Breadcrumbs, PageContainer/);
  assert.match(eventsPage, /<PageContainer/);
  assert.match(calendar, /import \{ FilterBar \} from "@\/components\/page-system"/);
  assert.match(calendar, /<FilterBar className=\{styles\.toolbar\}>/);
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
  assert.match(contentPage, /slug === "kalendar"\) \{[\s\S]*return <EventsPage events=\{await getPublishedEvents\(\)\}/);
  assert.doesNotMatch(contentPage, /permanentRedirect\("\/podujatia"\)/);
  assert.match(sitemapSeo, /"\/podujatia\/kalendar"/);
});

test("event category routes restore the shared time filter from the URL", () => {
  assert.match(portalPage, /initialTime=\{eventTimeFilterFromParam\(\(await searchParams\)\.termin\)\}/);
  assert.match(contentPage, /eventTypeFromPortalSlug\(slug\)[\s\S]*initialTime=\{eventTimeFilterFromParam\(\(await searchParams\)\.termin\)\}/);
});
