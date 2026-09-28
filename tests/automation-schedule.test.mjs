import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_TIMEZONE,
  assertAutomationScheduleMinimumCadence,
  automationScheduleFromStorage,
  effectiveAutomationCadenceMinutes,
  formatAutomationScheduleSummary,
  nextAutomationScheduledAt,
  parseAutomationSchedule,
} from "../lib/automation-schedule.ts";

const calendar = (daysOfWeek, localTime = "08:00") => ({
  mode: "CALENDAR",
  daysOfWeek,
  localTime,
  timezone: AUTOMATION_TIMEZONE,
});

test("Monday 08:00 from Sunday resolves to the next Monday", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-09-27T10:00:00.000Z")),
    "2026-09-28T06:00:00.000Z",
  );
});

test("Monday 07:59 local resolves to Monday 08:00", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-09-28T05:59:00.000Z")),
    "2026-09-28T06:00:00.000Z",
  );
});

test("Monday 08:01 local resolves to the following Monday without drift", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-09-28T06:01:00.000Z")),
    "2026-10-05T06:00:00.000Z",
  );
});

test("Monday Wednesday Friday calendar selects the nearest occurrence", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON", "WED", "FRI"], "08:30"), new Date("2026-09-29T12:00:00.000Z")),
    "2026-09-30T06:30:00.000Z",
  );
});

test("all weekdays behave as a daily calendar schedule", () => {
  assert.equal(
    nextAutomationScheduledAt(
      calendar(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], "06:00"),
      new Date("2026-09-28T07:00:00.000Z"),
    ),
    "2026-09-29T04:00:00.000Z",
  );
  assert.equal(
    formatAutomationScheduleSummary(calendar(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], "06:00")),
    "Každý deň o 06:00",
  );
});

test("Europe/Bratislava winter offset is CET", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-01-04T12:00:00.000Z")),
    "2026-01-05T07:00:00.000Z",
  );
});

test("Europe/Bratislava summer offset is CEST", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-07-05T12:00:00.000Z")),
    "2026-07-06T06:00:00.000Z",
  );
});

test("spring-forward nonexistent local time uses first valid local instant after it", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["SUN"], "02:30"), new Date("2026-03-28T12:00:00.000Z")),
    "2026-03-29T01:00:00.000Z",
  );
});

test("fall-back repeated wall-clock slot is scheduled only once", () => {
  const schedule = calendar(["SUN"], "02:30");
  const first = nextAutomationScheduledAt(schedule, new Date("2026-10-24T12:00:00.000Z"));
  assert.equal(first, "2026-10-25T00:30:00.000Z");
  assert.equal(
    nextAutomationScheduledAt(schedule, new Date(first)),
    "2026-11-01T01:30:00.000Z",
  );
});

test("missed calendar run does not drift from the wall-clock schedule", () => {
  assert.equal(
    nextAutomationScheduledAt(calendar(["MON"]), new Date("2026-09-28T06:12:00.000Z")),
    "2026-10-05T06:00:00.000Z",
  );
});

test("effective cadence includes Friday to Monday wrap-around", () => {
  assert.equal(effectiveAutomationCadenceMinutes(calendar(["MON", "FRI"])), 4320);
  assert.equal(effectiveAutomationCadenceMinutes(calendar(["MON", "WED", "FRI"])), 2880);
});

test("calendar minimum cadence governance uses the shortest gap", () => {
  assert.throws(
    () => assertAutomationScheduleMinimumCadence(calendar(["MON", "TUE"]), 2880),
    /automation_schedule_minimum_cadence/,
  );
  assert.doesNotThrow(
    () => assertAutomationScheduleMinimumCadence(calendar(["MON", "WED", "FRI"]), 2880),
  );
});

test("legacy rows with NULL schedule fields remain interval schedules", () => {
  assert.deepEqual(
    automationScheduleFromStorage({
      cadenceMinutes: 10080,
      scheduleMode: null,
      scheduleDaysJson: null,
      scheduleLocalTime: null,
      scheduleTimezone: null,
    }),
    { mode: "INTERVAL", intervalMinutes: 10080 },
  );
});

test("schedule parser rejects malformed weekdays, duplicates, time and timezone", () => {
  assert.throws(
    () => parseAutomationSchedule({ mode: "CALENDAR", daysOfWeek: [], localTime: "08:00", timezone: AUTOMATION_TIMEZONE }),
    /automation_schedule_days_invalid/,
  );
  assert.throws(
    () => parseAutomationSchedule({ mode: "CALENDAR", daysOfWeek: ["MON", "MON"], localTime: "08:00", timezone: AUTOMATION_TIMEZONE }),
    /automation_schedule_days_duplicate/,
  );
  assert.throws(
    () => parseAutomationSchedule({ mode: "CALENDAR", daysOfWeek: ["XYZ"], localTime: "08:00", timezone: AUTOMATION_TIMEZONE }),
    /automation_schedule_weekday_invalid/,
  );
  assert.throws(
    () => parseAutomationSchedule({ mode: "CALENDAR", daysOfWeek: ["MON"], localTime: "24:00", timezone: AUTOMATION_TIMEZONE }),
    /automation_schedule_time_invalid/,
  );
  assert.throws(
    () => parseAutomationSchedule({ mode: "CALENDAR", daysOfWeek: ["MON"], localTime: "08:00", timezone: "UTC" }),
    /automation_schedule_timezone_invalid/,
  );
});
