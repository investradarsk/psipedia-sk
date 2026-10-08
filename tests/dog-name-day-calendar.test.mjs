import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarMonthDays,
  calendarMonthLabel,
  moveCalendarMonth,
  publishedNamesForCalendarDate,
  resolveDogNameDayCalendar,
  todayInBratislava,
} from "../lib/dog-name-day-calendar.ts";

const record = (month, day, name, status = "published") => ({ month, day, name, status });

test("Bratislava date is independent of the UTC date boundary", () => {
  assert.equal(todayInBratislava(new Date("2026-12-31T22:30:00Z")), "2026-12-31");
  assert.equal(todayInBratislava(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
});

test("calendar starts on Monday and month labels are Slovak", () => {
  const days = calendarMonthDays("2026-10");
  assert.equal(days.length, 35);
  assert.equal(days[0].date, "2026-09-28");
  assert.equal(calendarMonthLabel("2026-10"), "október 2026");
});

test("December and January navigation retains year and defaults to today", () => {
  assert.equal(moveCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(moveCalendarMonth("2027-01", -1), "2026-12");
  const state = resolveDogNameDayCalendar("", "", "2027-01-01");
  assert.equal(state.month, "2027-01");
  assert.equal(state.selectedDay, "2027-01-01");
  assert.equal(resolveDogNameDayCalendar("2026-12", "", "2027-01-01").selectedDay, "");
});

test("leap day exists only in leap years and invalid selection cannot leak other months", () => {
  assert.equal(calendarMonthDays("2028-02").filter((d) => d.inMonth).length, 29);
  assert.equal(calendarMonthDays("2027-02").filter((d) => d.inMonth).length, 28);
  assert.equal(resolveDogNameDayCalendar("2028-02", "2028-02-29", "2026-10-08").selectedDay, "2028-02-29");
  assert.equal(resolveDogNameDayCalendar("2027-02", "2027-02-29", "2026-10-08").selectedDay, "");
  assert.equal(resolveDogNameDayCalendar("2026-11", "2026-10-08", "2026-10-08").selectedDay, "");
});

test("canonical publication state, missing dates, multiple names and dedupe", () => {
  const records = [
    record(2, 29, "Nea"),
    record(2, 29, "  NÉA "),
    record(2, 29, "Rex"),
    record(2, 29, "Unpublished", "draft"),
    record(2, 29, "Archived", "archived"),
  ];
  assert.deepEqual(publishedNamesForCalendarDate("2028-02-29", records), ["Nea", "Rex"]);
  assert.deepEqual(publishedNamesForCalendarDate("2027-02-29", records), []);
  assert.deepEqual(publishedNamesForCalendarDate("2028-02-28", records), []);
});
