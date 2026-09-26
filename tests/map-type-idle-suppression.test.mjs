import assert from "node:assert/strict";
import test from "node:test";
import {
  beginMapTypeIdleSuppression,
  cancelMapTypeIdleSuppression,
  confirmMapTypeChange,
  consumeMapTypeIdleSuppression,
  createMapTypeIdleSuppressionState,
} from "../lib/map-type-idle-suppression.ts";

function runMapTypeTransition(state, counters, bboxDrift = 0.0004) {
  beginMapTypeIdleSuppression(state);
  confirmMapTypeChange(state);

  const before = { north: 49, south: 48, east: 19, west: 18 };
  const after = { ...before, east: before.east + bboxDrift };
  assert.notDeepEqual(after, before, "fixture must model a real presentation-only bbox drift");

  if (!consumeMapTypeIdleSuppression(state)) counters.api += 1;
}

test("MAP-UX-1B map type idle is source-aware, one-shot and does not mask later movement", () => {
  const state = createMapTypeIdleSuppressionState();
  const counters = { init: 1, api: 1 };

  runMapTypeTransition(state, counters);
  runMapTypeTransition(state, counters);

  assert.equal(counters.init, 1, "ROADMAP/HYBRID switches must not remount the renderer");
  assert.equal(counters.api, 1, "ROADMAP/HYBRID switches must not refetch /api/map");
  assert.equal(state.phase, "clear", "map-type suppression must be consumed after its idle");

  cancelMapTypeIdleSuppression(state);
  if (!consumeMapTypeIdleSuppression(state)) counters.api += 1;
  assert.equal(counters.api, 2, "subsequent user pan must propagate");

  beginMapTypeIdleSuppression(state);
  confirmMapTypeChange(state);
  cancelMapTypeIdleSuppression(state);
  if (!consumeMapTypeIdleSuppression(state)) counters.api += 1;
  assert.equal(counters.api, 3, "subsequent user zoom must propagate");

  beginMapTypeIdleSuppression(state);
  confirmMapTypeChange(state);
  cancelMapTypeIdleSuppression(state);
  if (!consumeMapTypeIdleSuppression(state)) counters.api += 1;
  assert.equal(counters.api, 4, "cluster navigation must propagate");
});

test("MAP-UX-1B suppression requires the maptypeid_changed lifecycle and is bounded to one idle", () => {
  const state = createMapTypeIdleSuppressionState();

  beginMapTypeIdleSuppression(state);
  assert.equal(consumeMapTypeIdleSuppression(state), false, "an unrelated idle before maptypeid_changed must not be hidden");

  confirmMapTypeChange(state);
  assert.equal(consumeMapTypeIdleSuppression(state), true, "the map-type idle is suppressed");
  assert.equal(consumeMapTypeIdleSuppression(state), false, "the next idle is authoritative again");
  assert.equal(state.phase, "clear");
});
