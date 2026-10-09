import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MAP_RETURN_KEY, sheetStateAfterDrag, validMapReturnState } from "../lib/map-mobile-ux.ts";
import {
  EMPTY_MAP_FILTERS,
  MAP_DEFAULT_BBOX,
  MAP_FETCH_DEBOUNCE_MS,
  MapRequestGate,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  buildMapApiUrl,
  detailMapCommandForItems,
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


test("Google Maps public links are coordinate-only, deterministic HTTPS URLs", () => {
  const place = buildGoogleMapsPlaceUrl(48.3069, 18.0864);
  const directions = buildGoogleMapsDirectionsUrl(48.3069, 18.0864);
  assert.equal(place, "https://www.google.com/maps/search/?api=1&query=48.3069%2C18.0864");
  assert.equal(directions, "https://www.google.com/maps/dir/?api=1&destination=48.3069%2C18.0864");
  assert.equal(new URL(place).protocol, "https:");
  assert.equal(new URL(directions).protocol, "https:");
  assert.equal(new URL(place).searchParams.get("query"), "48.3069,18.0864");
  assert.equal(new URL(directions).searchParams.get("destination"), "48.3069,18.0864");
});

test("Google Maps public links fail closed for invalid coordinates", () => {
  for (const [latitude, longitude] of [
    [Number.NaN, 18],
    [48, Number.POSITIVE_INFINITY],
    [91, 18],
    [-91, 18],
    [48, 181],
    [48, -181],
  ]) {
    assert.equal(buildGoogleMapsPlaceUrl(latitude, longitude), null);
    assert.equal(buildGoogleMapsDirectionsUrl(latitude, longitude), null);
  }
});


test("PUBLIC-MAPS-1 detail viewport helper centers one marker and fits multiple markers", () => {
  const one = detailMapCommandForItems([
    { id: "service:1", latitude: 48.306, longitude: 18.086 },
  ], 1);
  assert.deepEqual(one, {
    key: 1,
    type: "item",
    id: "service:1",
    latitude: 48.306,
    longitude: 18.086,
    zoom: 15,
  });

  const many = detailMapCommandForItems([
    { id: "organization:1:location:1", latitude: 48.3, longitude: 18.1 },
    { id: "organization:1:location:2", latitude: 48.1, longitude: 17.8 },
  ], 2);
  assert.deepEqual(many, {
    key: 2,
    type: "fit",
    bounds: { north: 48.3, south: 48.1, east: 18.1, west: 17.8 },
    padding: 48,
    maxZoom: 15,
  });
});

test("mobile sheet has predictable collapsed, preview and expanded gestures", () => {
  assert.equal(sheetStateAfterDrag("peek", -130, -0.3, 400), "expanded");
  assert.equal(sheetStateAfterDrag("expanded", 130, 0.3, 400), "peek");
  assert.equal(sheetStateAfterDrag("peek", -75, -0.2, 400), "preview");
  assert.equal(sheetStateAfterDrag("preview", -75, -0.2, 400), "expanded");
  assert.equal(sheetStateAfterDrag("preview", 75, 0.2, 400), "peek");
  assert.equal(sheetStateAfterDrag("expanded", 0, 0, 400), "expanded");
});

test("map return restores only a short-lived, validated camera for the matching filters", () => {
  const now = Date.now();
  const context = {
    filtersKey: "category=services", savedAt: now - 1000, selectedItemId: "service:24",
    viewport: { zoom: 14, center: { lat: 48.3, lng: 18.1 },
      bbox: { north: 48.6, south: 48, east: 18.4, west: 17.8 } },
  };
  assert.equal(MAP_RETURN_KEY, "psipedia-map-return-v3");
  assert.deepEqual(validMapReturnState(JSON.stringify(context), context.filtersKey), context);
  assert.equal(validMapReturnState(JSON.stringify(context), "category=events"), null);
  assert.equal(validMapReturnState(JSON.stringify({ ...context, savedAt: now - 31 * 60_000 }), context.filtersKey), null);
  assert.equal(validMapReturnState(JSON.stringify({ ...context, viewport: { ...context.viewport, zoom: 999 } }), context.filtersKey), null);
  assert.equal(validMapReturnState(JSON.stringify({ ...context, selectedItemId: "x".repeat(200) }), context.filtersKey), null);
  assert.equal(validMapReturnState("{", context.filtersKey), null);
});

test("mobile map keeps rendering and filtering local, 44px controls and a dismissible sheet", () => {
  const view = readFileSync(new URL("../components/map/map-experience.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/map/map-public.module.css", import.meta.url), "utf8");
  assert.match(view, /onClusterClick={selectCluster}/);
  assert.match(view, /onSelectItem={selectItemById}/);
  assert.match(view, /selectItem\(item, !singletonClusterItem, "preview"\)/);
  assert.match(view, /container\.scrollTop \+=/);
  assert.doesNotMatch(view, /scrollIntoView\(\{ block: "nearest"/);
  assert.match(view, /onNavigateToProfile={saveMapReturnContext}/);
  assert.match(view, /onClick=\{\(\) => onNavigateToProfile\(item\.id\)\}/);
  assert.match(view, /data-testid="map-close-selection"/);
  assert.match(view, /onPointerDown=\{beginSheetDrag\}/);
  assert.doesNotMatch(view, /onPointerDown=\{\(event\) => beginSheetDrag\(event, "list"\)\}/);
  assert.match(css, /data-sheet-state="preview"/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /max-width: 360px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /overflow-x: clip/);
});
