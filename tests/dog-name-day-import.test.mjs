import assert from "node:assert/strict";
import test from "node:test";
import { planDogNameDayImport } from "../lib/dog-name-day-import.ts";

function existing(overrides = {}) {
  return {
    id: 1,
    month: 1,
    day: 1,
    name: "TEST ALPHA",
    normalizedName: "test alpha",
    status: "draft",
    source: "fixture-source-v1",
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    createdBy: "test",
    updatedBy: "test",
    ...overrides,
  };
}

test("new valid import row plans INSERT and never carries a publication status", () => {
  const plan = planDogNameDayImport([], [{ month: 2, day: 29, name: "TEST LEAP", source: "fixture-source" }]);
  assert.deepEqual(plan.summary, { INSERT: 1, UPDATE: 0, SKIP: 0, ERROR: 0 });
  assert.equal(plan.actions[0].record?.name, "TEST LEAP");
  assert.equal("status" in plan.actions[0].record, false);
});

test("identical existing row plans SKIP", () => {
  const plan = planDogNameDayImport([existing()], [{ month: 1, day: 1, name: "TEST ALPHA", source: "fixture-source-v1" }]);
  assert.deepEqual(plan.summary, { INSERT: 0, UPDATE: 0, SKIP: 1, ERROR: 0 });
});

test("changed draft provenance plans UPDATE", () => {
  const plan = planDogNameDayImport([existing()], [{ month: 1, day: 1, name: "TEST ALPHA", source: "fixture-source-v2" }]);
  assert.deepEqual(plan.summary, { INSERT: 0, UPDATE: 1, SKIP: 0, ERROR: 0 });
});

test("import cannot silently change a published or archived canonical row", () => {
  for (const status of ["published", "archived"]) {
    const plan = planDogNameDayImport([existing({ status })], [{ month: 1, day: 1, name: "TEST ALPHA", source: "changed" }]);
    assert.equal(plan.summary.ERROR, 1);
    assert.match(plan.actions[0].message, /nesmie automaticky meniť/);
  }
});

test("duplicate within one import is rejected", () => {
  const plan = planDogNameDayImport([], [
    { month: 3, day: 3, name: "TÉST DUP", source: "a" },
    { month: 3, day: 3, name: "test dup", source: "b" },
  ]);
  assert.deepEqual(plan.summary, { INSERT: 1, UPDATE: 0, SKIP: 0, ERROR: 1 });
});

test("invalid calendar date is rejected by import validation", () => {
  const plan = planDogNameDayImport([], [{ month: 2, day: 30, name: "TEST INVALID", source: "fixture" }]);
  assert.equal(plan.summary.ERROR, 1);
  assert.match(plan.actions[0].message, /Neplatný deň alebo mesiac/);
});

test("source provenance is required", () => {
  const plan = planDogNameDayImport([], [{ month: 4, day: 2, name: "TEST NO SOURCE" }]);
  assert.equal(plan.summary.ERROR, 1);
  assert.match(plan.actions[0].message, /zdroj\/proveniencia/);
});
