import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FACEBOOK_PLAN_KEYS,
  bratislavaToday,
  facebookPlanAddDays,
  facebookPlanSlotsForDay,
  facebookPlanWeekStart,
  isFacebookPlanDate,
  isFacebookPlanKey,
} from "../lib/facebook-weekly-plan.ts";

test("all seven days include exactly eight distinct categories with varying order", () => {
  const keys = new Set(FACEBOOK_PLAN_KEYS);
  const firstTimes = new Set();
  for (let day = 0; day < 7; day++) {
    const slots = facebookPlanSlotsForDay(day, facebookPlanAddDays("2026-11-02", day));
    assert.equal(slots.length, 8);
    assert.deepEqual(new Set(slots.map((slot) => slot.key)), keys);
    assert.deepEqual(new Set(slots.map((slot) => slot.time)).size, 8);
    firstTimes.add(slots[0].key);
  }
  assert.ok(firstTimes.size >= 5, "weekly categories must be shuffled");
  assert.equal(facebookPlanSlotsForDay(0, "2026-11-02").find((item) => item.key === "article")?.label,
    "Článok · Výcvik");
  assert.equal(facebookPlanSlotsForDay(1, "2026-11-03").find((item) => item.key === "article")?.label,
    "Článok · Šteniatka");
  assert.equal(facebookPlanSlotsForDay(2, "2026-11-04").find((item) => item.key === "article")?.label,
    "Článok · Zdravie");
  assert.equal(facebookPlanSlotsForDay(0, "2026-11-09").find((item) => item.key === "article")?.label,
    "Článok · Šteniatka", "the rotation must continue after Sunday");
  assert.throws(() => facebookPlanSlotsForDay(7));
});

test("Bratislava week boundaries and DST use local civil dates", () => {
  assert.equal(bratislavaToday(new Date("2026-11-04T22:50:00Z")), "2026-11-04");
  assert.equal(bratislavaToday(new Date("2026-11-04T23:20:00Z")), "2026-11-05");
  assert.equal(facebookPlanWeekStart(new Date("2026-11-04T22:00:00Z")), "2026-11-02");
  assert.equal(facebookPlanAddDays("2026-10-25", 7), "2026-11-01");
  assert.equal(facebookPlanWeekStart(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
});

test("only current and next week accept valid dates and known categories", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  assert.equal(isFacebookPlanDate("2026-11-02", now), true);
  assert.equal(isFacebookPlanDate("2026-11-15", now), true);
  assert.equal(isFacebookPlanDate("2026-11-16", now), false);
  assert.equal(isFacebookPlanDate("2026-11-01", now), false);
  assert.equal(isFacebookPlanDate("2026-02-30", now), false);
  assert.equal(isFacebookPlanDate("not a date", now), false);
  assert.equal(isFacebookPlanKey("infographic"), true);
  assert.equal(isFacebookPlanKey("publish"), false);
});

test("admin route and migration remain owner-only manual planning, not publishing", () => {
  const route = readFileSync("app/api/admin/facebook-weekly-plan/route.ts", "utf8");
  const migration = readFileSync("drizzle/0157_facebook_weekly_plan_marks.sql", "utf8");
  const planner = readFileSync("components/admin-facebook-weekly-planner.tsx", "utf8");
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /isFacebookPlanDate\(values.date\)/);
  assert.match(route, /isFacebookPlanKey\(values.slotKey\)/);
  assert.match(migration, /PRIMARY KEY \(slot_date, slot_key\)/);
  assert.match(planner, /aria-pressed=\{planned\}/);
  assert.doesNotMatch(route, /publishFacebook|sendToFacebook|notionSync/i);
});
