import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("calendar mobile visual contract keeps a genuine seven-day grid and legible counts", () => {
  const css = read("components/events-public.module.css");
  const calendar = read("components/event-calendar.tsx");
  const start = css.lastIndexOf("/* PUBLIC-CALENDAR-MOBILE-1:");
  assert.ok(start > 0, "calendar-only mobile extension is present");
  const contract = css.slice(start);
  assert.match(css, /\.monthGrid \{[\s\S]*?grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(contract, /@media \(max-width: 520px\)/);
  assert.match(contract, /@media \(max-width: 360px\)/);
  assert.match(contract, /\.calendarLayout \.monthDay,/);
  assert.match(contract, /height: 58px/);
  assert.match(contract, /height: 54px/);
  assert.match(contract, /\.calendarLayout \.monthDayCount \{/);
  assert.match(contract, /\.calendarLayout \.calendarLegend \{/);
  assert.match(calendar, /data-calendar-date=\{day\.date\}/);
  assert.match(calendar, /aria-current=\{todayFlag \? "date" : undefined\}/);
  assert.match(calendar, /data-selected=\{active \? "true" : undefined\}/);
});

test("calendar-only polish does not change listing, event records, or navigation semantics", () => {
  const css = read("components/events-public.module.css");
  const contract = css.slice(css.lastIndexOf("/* PUBLIC-CALENDAR-MOBILE-1:"));
  assert.doesNotMatch(contract, /\.cardGrid|\.listingLayout|\.gridCard|\.filterSidebar/);
  assert.doesNotMatch(contract, /position:\s*(?:fixed|sticky)|display:\s*none/);
  assert.match(css, /\.monthNavigation a:focus-visible,[\s\S]*?\.monthDay:focus-visible/);
  assert.match(css, /\.calendarLegend a:focus-visible/);
});
