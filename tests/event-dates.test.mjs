import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bratislavaDateKey,
  eventDateStatus,
  eventDateTimeIso,
  eventIsActive,
  eventIsPast,
  formatEventDate,
} from "../lib/events.ts";

const today = "2026-09-07";

test("event date status consistently separates yesterday, today and tomorrow", () => {
  assert.equal(eventDateStatus({ startDate: "2026-09-06", endDate: null }, today), "past");
  assert.equal(eventIsPast({ startDate: "2026-09-06", endDate: null }, today), true);
  assert.equal(eventDateStatus({ startDate: today, endDate: null }, today), "current");
  assert.equal(eventDateStatus({ startDate: "2026-09-08", endDate: null }, today), "upcoming");
  assert.equal(eventIsActive({ startDate: "2026-09-08", endDate: null }, today), true);
});

test("a multi-day event stays current through its end date", () => {
  const event = { startDate: "2026-09-05", endDate: "2026-09-07" };
  assert.equal(eventDateStatus(event, today), "current");
  assert.equal(eventIsActive(event, today), true);
  assert.equal(eventDateStatus(event, "2026-09-08"), "past");
  const formatted = formatEventDate(event);
  assert.match(formatted, /5\./);
  assert.match(formatted, /7\./);
  assert.match(formatted, /2026/);
});

test("Bratislava date key does not cross a day at UTC midnight", () => {
  assert.equal(bratislavaDateKey(new Date("2026-01-01T23:30:00.000Z")), "2026-01-02");
  assert.equal(bratislavaDateKey(new Date("2026-07-01T22:30:00.000Z")), "2026-07-02");
});

test("structured event times use the Bratislava DST offset for their date", () => {
  assert.equal(eventDateTimeIso("2026-01-15", "09:30"), "2026-01-15T09:30:00+01:00");
  assert.equal(eventDateTimeIso("2026-07-15", "09:30"), "2026-07-15T09:30:00+02:00");
  assert.equal(eventDateTimeIso("2026-07-15", ""), "2026-07-15");
});

test("homepage and podujatia hub use the same upcoming query", () => {
  const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
  const eventsPage = readFileSync(new URL("../components/events-page.tsx", import.meta.url), "utf8");
  assert.match(homepage, /getUpcomingEvents\(3\)/);
  assert.match(portal, /getUpcomingEvents\(3\)/);
  assert.match(calendar, /eventDateStatus\(event, today\)/);
  assert.match(eventsPage, /bratislavaDateKey\(\)/);
  assert.doesNotMatch(`${calendar}\n${eventsPage}`, /toISOString\(\)\.slice\(0, 10\)/);
});
