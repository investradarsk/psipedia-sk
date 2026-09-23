import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_MAP_FILTERS,
  MAP_DEFAULT_BBOX,
  MAP_FETCH_DEBOUNCE_MS,
  MapRequestGate,
  buildMapApiUrl,
  isApproximateMapItem,
  mapClusterTarget,
  mapFiltersForCategory,
  mapFiltersForDistrict,
  mapFiltersForRegion,
  mapFiltersFromSearchParams,
  parseMapUiFilters,
  scheduleMapRequest,
  selectedMapItemAfterResponse,
  serializeMapUiFilters,
} from "../lib/map-public-ui.ts";

test("filter URL parsing and serialization keep only meaningful shareable state", () => {
  const filters = parseMapUiFilters({
    category: "services",
    subcategory: "veterinari",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    search: "veterina",
    eventTiming: "active",
  });
  const params = serializeMapUiFilters(filters);
  assert.equal(params.get("category"), "services");
  assert.equal(params.get("subcategory"), "veterinari");
  assert.equal(params.get("region"), "Nitriansky kraj");
  assert.equal(params.get("eventTiming"), null);
  assert.equal(params.has("north"), false);
  assert.equal(params.has("zoom"), false);

  assert.deepEqual(mapFiltersFromSearchParams(params), filters);
  assert.equal(parseMapUiFilters({ category: "invalid", eventTiming: "past" }).category, "");
  assert.equal(parseMapUiFilters({ category: "invalid", eventTiming: "past" }).eventTiming, "active");
});

test("dependent filters reset stale district/city and category-specific state", () => {
  const seeded = {
    ...EMPTY_MAP_FILTERS,
    category: "services",
    subcategory: "veterinari",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    eventType: "Výstava",
  };
  assert.deepEqual(mapFiltersForRegion(seeded, "Trnavský kraj"), {
    ...seeded,
    region: "Trnavský kraj",
    district: "",
    city: "",
  });
  assert.equal(mapFiltersForDistrict(seeded, "Levice").city, "");

  const events = mapFiltersForCategory(seeded, "events");
  assert.equal(events.subcategory, "");
  assert.equal(events.eventType, "Výstava");
  const services = mapFiltersForCategory(events, "services");
  assert.equal(services.eventType, "");
  assert.equal(services.eventTiming, "active");
});

test("API request construction serializes bbox/zoom and filters without global-search workaround", () => {
  const url = new URL(buildMapApiUrl({
    bbox: MAP_DEFAULT_BBOX,
    center: { lat: 48.669, lng: 19.699 },
    zoom: 12,
  }, {
    ...EMPTY_MAP_FILTERS,
    category: "services",
    region: "Nitriansky kraj",
    search: " veterinár ",
  }), "https://psipedia.sk");
  assert.equal(url.pathname, "/api/map");
  assert.equal(url.searchParams.get("north"), String(MAP_DEFAULT_BBOX.north));
  assert.equal(url.searchParams.get("zoom"), "12");
  assert.equal(url.searchParams.get("category"), "services");
  assert.equal(url.searchParams.get("search"), "veterinár");
});

test("debounce helper delays execution and cancellation prevents stale scheduled work", async () => {
  assert.equal(MAP_FETCH_DEBOUNCE_MS, 280);
  let calls = 0;
  const cancelled = scheduleMapRequest(() => { calls += 1; }, 10);
  cancelled.cancel();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 0);

  scheduleMapRequest(() => { calls += 1; }, 10);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 1);
});

test("request gate aborts old work and stale responses cannot become current", () => {
  const gate = new MapRequestGate();
  const first = gate.begin();
  assert.equal(first.isCurrent(), true);
  const second = gate.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  gate.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});

test("selected item survives only while it exists in an item response", () => {
  const item = {
    id: "service:1",
    entityType: "service",
    entityId: 1,
    name: "Veterina",
    category: "services",
    href: "/adresar/veterinari/veterina",
    latitude: 48,
    longitude: 18,
    precision: "EXACT",
  };
  const response = {
    mode: "items",
    items: [item],
    meta: {
      count: 1,
      matched: 1,
      truncated: false,
      bbox: MAP_DEFAULT_BBOX,
      zoom: 12,
      cacheTtlSeconds: 30,
    },
  };
  assert.equal(selectedMapItemAfterResponse("service:1", response), "service:1");
  assert.equal(selectedMapItemAfterResponse("service:2", response), null);
  assert.equal(selectedMapItemAfterResponse("service:1", {
    ...response,
    mode: "clusters",
    clusters: [],
  }), null);
});

test("approximate labeling and cluster zoom target are deterministic", () => {
  assert.equal(isApproximateMapItem({ precision: "EXACT" }), false);
  assert.equal(isApproximateMapItem({ precision: "MUNICIPALITY" }), true);
  assert.deepEqual(mapClusterTarget({ latitude: 48.3, longitude: 18.1 }, 7), {
    latitude: 48.3,
    longitude: 18.1,
    zoom: 9,
  });
  assert.equal(mapClusterTarget({ latitude: 48.3, longitude: 18.1 }, 19).zoom, 20);
});
