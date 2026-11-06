import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
const calendarRoute = readFileSync(new URL("../app/api/public/events/calendar/route.ts", import.meta.url), "utf8");
const dayRoute = readFileSync(new URL("../app/api/public/events/calendar/day/route.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/event-store.ts", import.meta.url), "utf8");
const backLink = readFileSync(new URL("../components/events-return-link.tsx", import.meta.url), "utf8");

test("selecting a day preserves the month and listing and fetches only its 12 bounded previews", () => {
  const dayBranch = client.slice(client.indexOf("if (sameMonth && !pending)"), client.indexOf("    const calendarOnly = sameListing && !next.day;"));
  assert.match(dayBranch, /setData\(\(current\) => \(\{ \.\.\.current, calendarEvents:/);
  assert.match(dayBranch, /dayEndpoint\.pathname \+= "\/day"/);
  assert.match(dayBranch, /if \(!next\.day \|\|/);
  assert.match(dayBranch, /cacheRef\.current\.get\(key\)/);
  assert.doesNotMatch(dayBranch, /setPending\(true\)/);
  assert.match(client, /requestRef\.current\?\.abort\(\)/);
  assert.match(dayRoute, /getPublicEventDayPreview\(/);
  assert.match(dayRoute, /calendarMonthDays\(month\)\.some/);
  assert.match(dayRoute, /Cache-Control": "private, no-store"/);
  assert.match(store, /export async function getPublicEventDayPreview/);
  assert.match(store, /ORDER BY \$\{sql\.order\} LIMIT 12/);
});

test("month-only requests preserve the current filtered listing and avoid refetching counts", () => {
  assert.match(client, /const calendarOnly = sameListing && !next\.day;/);
  assert.match(client, /endpoint\.searchParams\.set\("calendarOnly", "1"\)/);
  assert.match(client, /\{ \.\.\.data, calendarEvents: received\.calendarEvents, calendarSummaries: received\.calendarSummaries \}/);
  assert.match(calendarRoute, /if \(raw\.calendarOnly === "1"\)/);
  assert.ok(calendarRoute.indexOf('if (raw.calendarOnly === "1")') < calendarRoute.indexOf("getPublishedEventListing(filters)"));
  assert.match(store, /const \[rows, dayEvents\] = await Promise\.all\(/);
  assert.match(client, /window\.history\.pushState/);
  assert.match(client, /window\.addEventListener\("popstate", restore\)/);
});

test("calendar responses are cancellable, short-lived and bounded in browser cache", () => {
  assert.match(client, /new AbortController\(\)/);
  assert.match(client, /signal: controller\.signal/);
  assert.match(client, /cacheRef\.current\.size > 24/);
  assert.match(client, /120_000/);
  assert.match(client, /setPendingDay\(true\)/);
  assert.match(client, /aria-busy=\{pending \|\| pendingDay\}/);
});

test("browser back uses latest state and detail return remembers the selected day", () => {
  assert.match(client, /const navigateRef = useRef\(navigate\)/);
  assert.match(client, /navigateRef\.current = navigate/);
  assert.match(client, /void navigateRef\.current\(/);
  assert.match(client, /rememberEventsListing\(window\.location\.pathname/);
  assert.match(backLink, /export function rememberEventsListing\(href: string\)/);
});

test("failed day preview does not hide the main event listing", () => {
  assert.match(client, /setDayLoadError\("Podujatia sa nepodarilo načítať/);
  assert.match(client, /dayLoadError \|\| loadError/);
});
