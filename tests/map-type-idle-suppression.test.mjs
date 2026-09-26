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

function idle(state, runtimeMapType = null) {
  return consumeMapTypeIdleSuppression(state, runtimeMapType);
}

test("MAP-UX-1E single ROADMAP -> HYBRID suppresses presentation idle until HYBRID settles", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());

  assert.equal(idle(state, ROADMAP), true, "pre-settle presentation idle stays suppressed");
  assert.equal(state.pending, true);

  confirmMapTypeChange(state, HYBRID);
  assert.equal(idle(state, HYBRID), true, "settle idle is suppressed");
  assert.equal(state.pending, false);
});

test("MAP-UX-1E single HYBRID -> ROADMAP suppresses presentation idle until ROADMAP settles", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());
  confirmMapTypeChange(state, ROADMAP);

  assert.equal(idle(state, ROADMAP), true);
  assert.equal(state.pending, false);
});

test("MAP-UX-1E rapid ROADMAP -> HYBRID -> ROADMAP keeps latest desired type authoritative", () => {
  const state = createMapTypeIdleSuppressionState();
  const counters = { init: 1, api: 1 };

  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  const firstGeneration = state.generation;
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());
  assert.equal(state.generation, firstGeneration + 1);
  assert.equal(state.desiredMapType, ROADMAP);

  confirmMapTypeChange(state, HYBRID);
  if (!idle(state, HYBRID)) counters.api += 1;
  assert.equal(state.pending, true);

  confirmMapTypeChange(state, ROADMAP);
  if (!idle(state, ROADMAP)) counters.api += 1;

  assert.equal(counters.api, 1);
  assert.equal(counters.init, 1);
  assert.equal(state.pending, false);
});

test("MAP-UX-1E coalesced latest settle may complete with one idle", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  beginMapTypeIdleSuppression(state, ROADMAP, baseline());

  confirmMapTypeChange(state, HYBRID);
  confirmMapTypeChange(state, ROADMAP);

  assert.equal(idle(state, ROADMAP), true);
  assert.equal(state.pending, false);
  assert.equal(idle(state, ROADMAP), false, "post-settle unrelated idle must propagate");
});

test("MAP-UX-1E presentation viewport drift does not become authoritative without user intent", () => {
  const state = createMapTypeIdleSuppressionState();
  const before = baseline();
  const googlePresentationDrift = {
    center: { lat: before.center.lat + 0.000001, lng: before.center.lng - 0.000001 },
    zoom: before.zoom,
    bbox: { north: 50.86, south: 46.37, east: 24.35, west: 15.04 },
  };
  assert.notDeepEqual(googlePresentationDrift.center, before.center);
  assert.equal(googlePresentationDrift.zoom, before.zoom);

  beginMapTypeIdleSuppression(state, HYBRID, before);
  confirmMapTypeChange(state, HYBRID);
  assert.equal(idle(state, HYBRID), true, "Google presentation drift remains suppressed");
  assert.equal(state.pending, false);
});

test("MAP-UX-1E user pan intent cancels suppression before authoritative idle", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());

  cancelMapTypeIdleSuppression(state);
  assert.equal(idle(state, HYBRID), false);
  assert.equal(state.pending, false);
});

test("MAP-UX-1E user zoom intent cancels suppression before authoritative idle", () => {
  const state = createMapTypeIdleSuppressionState();
  beginMapTypeIdleSuppression(state, HYBRID, baseline());

  cancelMapTypeIdleSuppression(state);
  assert.equal(idle(state, HYBRID), false);
  assert.equal(state.pending, false);
});

test("MAP-UX-1E cluster/item/fit commands cancel suppression", () => {
  for (const command of ["cluster", "item", "fit"]) {
    const state = createMapTypeIdleSuppressionState();
    beginMapTypeIdleSuppression(state, HYBRID, baseline());
    cancelMapTypeIdleSuppression(state);
    assert.equal(idle(state, HYBRID), false, `${command} command must propagate its viewport idle`);
  }
});

test("MAP-UX-1E map init count stays one and post-settle movement propagates", () => {
  const state = createMapTypeIdleSuppressionState();
  const counters = { init: 1, api: 1 };

  beginMapTypeIdleSuppression(state, HYBRID, baseline());
  confirmMapTypeChange(state, HYBRID);
  if (!idle(state, HYBRID)) counters.api += 1;

  assert.equal(counters.init, 1);
  assert.equal(counters.api, 1);
  assert.equal(state.pending, false);

  if (!idle(state, HYBRID)) counters.api += 1;
  assert.equal(counters.api, 2, "subsequent authoritative idle must propagate");
});
