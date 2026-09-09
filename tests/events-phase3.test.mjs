import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalPage = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
const contentPage = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
const eventsPage = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
const eventsLib = readFileSync(new URL("../lib/events.ts", import.meta.url), "utf8");
const adminEditor = readFileSync(new URL("../components/admin-event-editor.tsx", import.meta.url), "utf8");
const sitemapSeo = readFileSync(new URL("../lib/sitemap-seo.ts", import.meta.url), "utf8");

test("/podujatia is the primary full event listing", () => {
  assert.match(portalPage, /slug === "podujatia" \? getPublishedEvents\(\)/);
  assert.match(portalPage, /slug === "podujatia"\) return <EventsPage/);
  assert.match(eventsPage, /<EventCalendar events=\{events\}/);
  assert.match(eventsPage, /href="\/podujatia\/pridat-podujatie"/);
});

test("event filters use the central event type and date sources", () => {
  assert.match(calendar, /eventTypeFilters\.map/);
  assert.match(calendar, /slovakRegions\.map/);
  assert.match(calendar, /eventDateStatus\(event, today\)/);
  assert.match(calendar, /dateStatus === "current"/);
  assert.match(calendar, /Nenašli sme zhodu/);
  assert.match(calendar, /resetFilters/);
  assert.doesNotMatch(calendar, /const eventTypes\s*=|new Date\(/);
});

test("admin and public event filters share eventTypes", () => {
  assert.match(eventsLib, /export const eventTypes =/);
  assert.match(eventsLib, /export const eventTypeFilters =/);
  assert.match(adminEditor, /import \{ eventTypes, slovakRegions/);
  assert.match(adminEditor, /eventTypes\.map/);
  assert.match(adminEditor, /slovakRegions\.map/);
});

test("legacy calendar URL is a noindex canonical alias excluded from sitemap", () => {
  assert.match(contentPage, /slug === "kalendar"[\s\S]*canonical: "\/podujatia"/);
  assert.match(contentPage, /robots: \{ index: false, follow: true \}/);
  assert.match(contentPage, /slug === "kalendar"\) \{[\s\S]*return <EventsPage events=\{await getPublishedEvents\(\)\}/);
  assert.doesNotMatch(contentPage, /permanentRedirect\("\/podujatia"\)/);
  assert.match(sitemapSeo, /"\/podujatia\/kalendar"/);
});
