import assert from "node:assert/strict";
import test from "node:test";
import {
  beginMapTypeIdleSuppression,
  cancelMapTypeIdleSuppression,
  confirmMapTypeChange,
  consumeMapTypeIdleSuppression,
  createMapTypeIdleSuppressionState,
} from "../lib/map-type-idle-suppression.ts";

const ROADMAP = "roadmap";
const HYBRID = "hybrid";
const baseline = () => ({ center: { lat: 48.1486, lng: 17.1077 }, zoom: 9 });

function idle(state, current = baseline(), runtimeMapType = null) {
  return consumeMapTypeIdleSuppression(state, current, runtimeMapType);
}

test("MAP-UX-1C single ROADMAP -> HYBRID settles without viewport propagation", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  confirmMapTypeChange(state, HYBRID);

  assert.equal(idle(state, baseline(), HYBRID), true);
  assert.equal(state.pending, false);
  assert.equal(state.desiredMapType, null);
});

test("MAP-UX-1C single HYBRID -> ROADMAP settles without viewport propagation", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());
  confirmMapTypeChange(state, ROADMAP);

  assert.equal(idle(state, baseline(), ROADMAP), true);
  assert.equal(state.pending, false);
});

test("MAP-UX-1C rapid ROADMAP -> HYBRID -> ROADMAP suppresses both presentation idles", () => {
  const state = createMapTypeIdleSuppressionState();
  const counters = { init: 1, api: 1 };

  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  const firstGeneration = state.generation;
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());
  assert.equal(state.generation, firstGeneration + 1);
  assert.equal(state.desiredMapType, ROADMAP);

  confirmMapTypeChange(state, HYBRID);
  if (!idle(state, baseline(), HYBRID)) counters.api += 1;
  assert.equal(state.pending, true, "stale HYBRID settle must keep latest ROADMAP transition pending");

  confirmMapTypeChange(state, ROADMAP);
  if (!idle(state, baseline(), ROADMAP)) counters.api += 1;

  assert.equal(counters.api, 1, "rapid presentation transitions must not refetch /api/map");
  assert.equal(counters.init, 1, "map type changes must not remount Google Maps");
  assert.equal(state.pending, false);
});

test("MAP-UX-1C overlapping maptypeid_changed ordering keeps latest desired type authoritative", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());

  confirmMapTypeChange(state, HYBRID);
  assert.equal(idle(state, baseline(), HYBRID), true);
  assert.equal(state.pending, true);

  confirmMapTypeChange(state, ROADMAP);
  assert.equal(idle(state, baseline(), ROADMAP), true);
  assert.equal(state.pending, false);
});

test("MAP-UX-1C coalesced maptypeid_changed events may settle latest type with one idle", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());

  confirmMapTypeChange(state, HYBRID);
  confirmMapTypeChange(state, ROADMAP);

  assert.equal(idle(state, baseline(), ROADMAP), true);
  assert.equal(state.pending, false);
  assert.equal(idle(state, baseline(), ROADMAP), false, "post-settle unrelated idle must propagate");
});

test("MAP-UX-1C bbox drift is irrelevant because suppression compares only center + zoom", () => {
  const state = createMapTypeIdleSuppressionState();
  const beforeBbox = { north: 49, south: 48, east: 19, west: 18 };
  const afterBbox = { ...beforeBbox, east: 19.0004 };
  assert.notDeepEqual(beforeBbox, afterBbox);

  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  confirmMapTypeChange(state, HYBRID);
  assert.equal(idle(state, baseline(), HYBRID), true);
});

test("MAP-UX-1C center movement cancels suppression and propagates viewport", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  confirmMapTypeChange(state, HYBRID);

  const moved = baseline();
  moved.center = { ...moved.center, lat: moved.center.lat + 0.01 };
  assert.equal(idle(state, moved, HYBRID), false);
  assert.equal(state.pending, false);
});

test("MAP-UX-1C zoom movement cancels suppression and propagates viewport", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  confirmMapTypeChange(state, HYBRID);

  const zoomed = { ...baseline(), zoom: 10 };
  assert.equal(idle(state, zoomed, HYBRID), false);
  assert.equal(state.pending, false);
});

test("MAP-UX-1C explicit navigation cancellation keeps cluster/item/fit idles authoritative", () => {
  for (const command of ["cluster", "item", "fit"]) {
    const state = createMapTypeIdleSuppressionState();
    beginMapTypeIdleSuppression(state, HYBRID, baseline());
    cancelMapTypeIdleSuppression(state);
    assert.equal(idle(state, baseline(), HYBRID), false, `${command} command must propagate its viewport idle`);
  }
});

test("MAP-UX-1C final state remains ROADMAP and subsequent pan + zoom propagate", () => {
  const state = createMapTypeIdleSuppressionState();
  const counters = { init: 1, api: 1 };

  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());
  confirmMapTypeChange(state, HYBRID);
  if (!idle(state, baseline(), HYBRID)) counters.api += 1;
  confirmMapTypeChange(state, ROADMAP);
  if (!idle(state, baseline(), ROADMAP)) counters.api += 1;

  assert.equal(state.pending, false);
  assert.equal(counters.api, 1);
  assert.equal(counters.init, 1);

  const panned = baseline();
  panned.center = { ...panned.center, lng: panned.center.lng + 0.02 };
  if (!idle(state, panned, ROADMAP)) counters.api += 1;

  const zoomed = { ...panned, zoom: 10 };
  if (!idle(state, zoomed, ROADMAP)) counters.api += 1;

  assert.equal(counters.api, 3, "pan and zoom after settle must both propagate");
});
