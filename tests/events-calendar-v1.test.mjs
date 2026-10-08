import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calendarMonthBounds,
  calendarMonthDays,
  calendarMonthLabel,
  calendarWeekdays,
  eventOverlapsDay,
  eventsForCalendarDay,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "../lib/event-calendar-view.ts";
import { bratislavaDateKey } from "../lib/events.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("monthly layout starts on Monday and spans whole calendar weeks", () => {
  const october = calendarMonthDays("2026-10");
  assert.equal(october[0].date, "2026-09-28");
  assert.equal(october.at(-1).date, "2026-11-01");
  assert.equal(october.filter((day) => day.inMonth).length, 31);
  assert.deepEqual(calendarWeekdays, ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]);
  assert.equal(calendarMonthLabel("2026-10"), "október 2026");
});

test("month navigation moves across years with URL-safe values", () => {
  assert.equal(moveCalendarMonth("2026-01", -1), "2025-12");
  assert.equal(moveCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(resolveCalendarMonth("2026-02", "2026-10", "2026-08-09"), "2026-02");
  assert.equal(resolveCalendarMonth("2026-99", "2026-10", "2026-08-09"), "2026-10");
  assert.equal(resolveCalendarMonth("", "", "2026-08-09"), "2026-08");
  assert.deepEqual(calendarMonthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("multi-day events appear on every inclusive day but keep one identity", () => {
  const event = { id: 41, startDate: "2026-10-30", endDate: "2026-11-02" };
  assert.equal(eventOverlapsDay(event, "2026-10-29"), false);
  assert.equal(eventOverlapsDay(event, "2026-10-30"), true);
  assert.equal(eventOverlapsDay(event, "2026-11-01"), true);
  assert.equal(eventOverlapsDay(event, "2026-11-02"), true);
  assert.equal(eventOverlapsDay(event, "2026-11-03"), false);
  assert.deepEqual(eventsForCalendarDay([event, { id: 42, startDate: "2026-11-01", endDate: null }], "2026-11-01").map((x) => x.id), [41, 42]);
  assert.equal(eventsForCalendarDay([], "2026-11-01").length, 0);
});

test("Bratislava day boundaries and DST do not shift the calendar day", () => {
  assert.equal(bratislavaDateKey(new Date("2026-03-29T22:30:00Z")), "2026-03-30");
  assert.equal(bratislavaDateKey(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(calendarMonthDays("2026-03").filter((x) => x.inMonth).length, 31);
  assert.equal(calendarMonthDays("2026-10").filter((x) => x.inMonth).length, 31);
});

test("one published-only bounded read powers calendar while listing remains canonical", () => {
  const store = read("lib/event-store.ts");
  const root = read("app/[section]/page.tsx");
  const type = read("app/[section]/[slug]/page.tsx");
  const page = read("components/events-page.tsx");
  const calendar = read("components/event-calendar.tsx");

  assert.match(store, /export async function getPublishedEventsInMonth/);
  assert.match(store, /WHERE status = 'published' AND start_date <= \? AND COALESCE\(end_date, start_date\) >= \?/);
  assert.match(store, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT 500/);
  assert.match(root, /getPublishedEventsInMonth\(calendarMonth\)/);
  assert.match(type, /getPublishedEventsInMonth\(calendarMonth\)/);
  assert.match(page, /<EventCalendar events=\{events\} calendarEvents=\{calendarEvents\}/);
  assert.match(calendar, /event\.status !== "published"/);
  assert.match(calendar, /const monthMatches = calendarEvents\.filter\(matchesFilters\)/);
  assert.doesNotMatch(calendar, /"use client"|useState|window\.history/);
});

test("hero precedes one search and calendar, with upcoming list and category navigator below", () => {
  const page = read("components/events-page.tsx");
  const calendar = read("components/event-calendar.tsx");
  assert.ok(page.indexOf("<UnifiedSectionHero") < page.indexOf("styles.calendarSection"));
  assert.ok(page.indexOf("styles.calendarSection") < page.indexOf("styles.landingCategories"));
  assert.equal((calendar.match(/name="q"/g) ?? []).length, 1);
  assert.match(calendar, /<PublicFilterDisclosure/);
  assert.match(calendar, /data-events-month-calendar/);
  assert.match(calendar, /data-selected-day=\{selectedDay\}/);
  assert.match(calendar, /aria-current=\{todayFlag \? "date" : undefined\}/);
  assert.match(calendar, /href=\{eventHref\(event\)\}/);
  assert.match(calendar, /data-event-list/);
  assert.match(calendar, /initialTime === "upcoming" && dateStatus !== "past"/);
  assert.match(calendar, /if \(query\) params\.set\("q", query\)/);
  assert.match(calendar, /if \(region\) params\.set\("region", region\)/);
  assert.match(calendar, /if \(month\) params\.set\("mesiac", month\)/);
  assert.match(calendar, /params\.set\("kalendar", targetMonth\)/);
  assert.match(calendar, /params\.set\("den", day\)/);
});
