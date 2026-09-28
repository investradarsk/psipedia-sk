import assert from "node:assert/strict";
import test from "node:test";
import {
  DOG_NAME_DAY_TIME_ZONE,
  dogNameDayDateKey,
  isValidDogNameDayDate,
  normalizeDogNameDayName,
  resolveDogNameDay,
} from "../lib/dog-name-days.ts";

function record(overrides = {}) {
  return {
    month: 1,
    day: 1,
    name: "TEST ALPHA",
    status: "published",
    ...overrides,
  };
}

test("valid published canonical record resolves on the matching Bratislava day", () => {
  const names = resolveDogNameDay(new Date("2026-01-01T12:00:00Z"), [record()]);
  assert.deepEqual(names, ["TEST ALPHA"]);
});

test("multiple published names can share one day", () => {
  const names = resolveDogNameDay(new Date("2026-01-01T12:00:00Z"), [record(), record({ name: "TEST BETA" })]);
  assert.deepEqual(names, ["TEST ALPHA", "TEST BETA"]);
});

test("draft and archived records are never public", () => {
  const names = resolveDogNameDay(new Date("2026-01-01T12:00:00Z"), [
    record({ name: "TEST DRAFT", status: "draft" }),
    record({ name: "TEST ARCHIVED", status: "archived" }),
  ]);
  assert.deepEqual(names, []);
});

test("empty canonical dataset fails closed", () => {
  assert.deepEqual(resolveDogNameDay(new Date("2026-01-01T12:00:00Z"), []), []);
});

test("calendar validation accepts leap day and rejects impossible dates", () => {
  assert.equal(isValidDogNameDayDate(2, 29), true);
  assert.equal(isValidDogNameDayDate(2, 30), false);
  assert.equal(isValidDogNameDayDate(4, 31), false);
  assert.equal(isValidDogNameDayDate(13, 1), false);
});

test("normalization supports accent-insensitive duplicate protection", () => {
  assert.equal(normalizeDogNameDayName("  TÉST   Meno "), "test meno");
});

test("resolver de-duplicates equivalent names for one day", () => {
  const names = resolveDogNameDay(new Date("2026-01-01T12:00:00Z"), [record({ name: "TÉST" }), record({ name: "test" })]);
  assert.deepEqual(names, ["TÉST"]);
});

test("date boundary is explicitly Europe/Bratislava", () => {
  assert.equal(DOG_NAME_DAY_TIME_ZONE, "Europe/Bratislava");
  assert.equal(dogNameDayDateKey(new Date("2026-12-31T22:30:00Z")), "12-31");
  assert.equal(dogNameDayDateKey(new Date("2026-12-31T23:30:00Z")), "01-01");
});

test("invalid Date fails closed", () => {
  assert.equal(dogNameDayDateKey(new Date(Number.NaN)), null);
  assert.deepEqual(resolveDogNameDay(new Date(Number.NaN), [record()]), []);
});
