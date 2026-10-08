import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EVENTS-PUBLIC-UX-V2 retains one published-data calendar and crawlable listing", () => {
  const page = source("components/events-page.tsx");
  const calendar = source("components/event-calendar.tsx");
  const route = source("app/[section]/page.tsx");

  assert.match(page, /<EventCalendar events=\{events\} calendarEvents=\{calendarEvents\}/);
  assert.match(calendar, /const monthMatches = calendarEvents\.filter\(matchesFilters\)/);
  assert.match(calendar, /data-events-month-calendar/);
  assert.match(calendar, /id="events-calendar"/);
  assert.match(calendar, /id="events-list"/);
  assert.match(calendar, /href="#events-list"/);
  assert.match(calendar, /href="#events-calendar"/);
  assert.match(calendar, /href=\{eventHref\(event\)\}/);
  assert.match(route, /getPublishedEventsInMonth\(calendarMonth\)/);
  assert.doesNotMatch(calendar, /"use client"|window\.history|useState/);
});

test("month navigation drops an obsolete month filter, preserving search and region", () => {
  const calendar = source("components/event-calendar.tsx");

  assert.match(calendar, /if \(query\) params\.set\("q", query\)/);
  assert.match(calendar, /if \(region\) params\.set\("region", region\)/);
  assert.match(calendar, /if \(month && targetMonth === month\) params\.set\("mesiac", month\)/);
  assert.match(calendar, /params\.set\("kalendar", targetMonth\)/);
  assert.match(calendar, /params\.set\("den", day\)/);
  assert.match(calendar, /href=\{timeHref\(value\)\}/);
  assert.match(calendar, /<PublicFilterDisclosure/);
  assert.match(calendar, /Vymazať filtre/);
  assert.match(calendar, /className=\{styles\.filterSummary\}/);
});

test("mobile cards and details keep online events accurate and provide a listing return", () => {
  const card = source("components/event-card.tsx");
  const detail = source("components/event-detail.tsx");
  const page = source("components/events-page.tsx");
  const returnLink = source("components/events-return-link.tsx");
  const css = source("components/events-public.module.css");

  assert.match(card, /event\.region === "Online" \? "Online podujatie"/);
  assert.match(card, /Miesto bude upresnené/);
  assert.doesNotMatch(card, /<strong>Organizátor<\/strong>/);
  assert.match(detail, /event\.region !== "Online" && publicMap\?\.items\.length/);
  assert.match(detail, /<EventsBackLink fallbackHref=\{typeHref \?\? "\/podujatia"\}/);
  assert.match(page, /<RememberEventsListing key=/);
  assert.match(returnLink, /window\.sessionStorage\.setItem/);
  assert.match(returnLink, /window\.sessionStorage\.getItem/);
  assert.match(returnLink, /MAX_AGE_MS/);
  assert.match(css, /\.eventCardWithImage[\s\S]*grid-template-columns: 62px minmax\(0, 1fr\) 68px/);
  assert.match(css, /\.toolbar \.filterToggle/);
  assert.match(css, /@media \(max-width: 380px\)/);
});

test("SEO recovery boundaries: no URL schema or indexing policy changes", () => {
  const listing = source("app/[section]/page.tsx");
  const detailRoute = source("app/[section]/[slug]/page.tsx");
  assert.match(listing, /resolveListingIndexPolicy/);
  assert.match(detailRoute, /resolveListingIndexPolicy/);
  assert.match(detailRoute, /buildEventJsonLd/);
  assert.match(detailRoute, /resolvedCanonical/);
});
