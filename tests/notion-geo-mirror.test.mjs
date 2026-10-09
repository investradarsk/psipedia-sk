import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notionGeoMirrorProperties, notionGeoMirrorChanges } from "../lib/notion-geo-mirror.ts";

const verified = {
  geo_status: "RESOLVED",
  geo_public_visibility: "EXACT_PUBLIC",
  geo_public_precision: "EXACT",
  geo_latitude: 48.321,
  geo_longitude: 18.401,
  geo_provider: "google_places",
  geo_google_place_id: "ChIJ-confirmed",
  geo_source_fingerprint: "address-v2",
  geo_google_place_source_fingerprint: "address-v2",
};

test("confirmed current Google place is exposed as canonical PLACE and exact coordinates", () => {
  const result = notionGeoMirrorProperties(verified);
  assert.equal(result["Google Place ID"], "ChIJ-confirmed");
  assert.equal(result["Google miesto aktuálne"], true);
  assert.equal(result["Google Maps cieľ"], "PLACE");
  assert.equal(result["Google Maps netreba"], false);
  assert.equal(result["Latitude"], 48.321);
  assert.equal(result["Longitude"], 18.401);
  assert.equal(result["Presnosť lokality"], "EXACT");
});

test("stale Google fingerprint cannot claim current Google location", () => {
  const result = notionGeoMirrorProperties({
    ...verified,
    geo_google_place_source_fingerprint: "old-address",
  });
  assert.equal(result["Google miesto aktuálne"], false);
  assert.equal(result["Google Place ID"], "");
  assert.equal(result["Google Maps cieľ"], "COORDINATES");
});

test("hidden or stale GEO never leaks coordinates or place ID to Notion", () => {
  for (const input of [
    { ...verified, geo_public_visibility: "HIDDEN" },
    { ...verified, geo_status: "STALE" },
    { ...verified, geo_latitude: null },
  ]) {
    const result = notionGeoMirrorProperties(input);
    assert.equal(result["Latitude"], null);
    assert.equal(result["Longitude"], null);
    assert.equal(result["Google Place ID"], "");
    assert.equal(result["Google Maps cieľ"], "");
  }
});

test("approximate location remains approximate, never a Google Place pin", () => {
  const result = notionGeoMirrorProperties({
    ...verified,
    geo_public_visibility: "APPROXIMATE_PUBLIC",
    geo_public_precision: "MUNICIPALITY",
  });
  assert.equal(result["Presnosť lokality"], "MUNICIPALITY");
  assert.equal(result["Google Maps cieľ"], "COORDINATES");
  assert.equal(result["Google miesto aktuálne"], false);
  assert.equal(result["Google Place ID"], "");
});

test("NOT_REQUIRED is based on explicit workflow decision or confirmed online event", () => {
  const fromWorkflow = notionGeoMirrorProperties({
    ...verified, google_maps_action: "GOOGLE_MAPS_NOT_REQUIRED",
  });
  const fromOnline = notionGeoMirrorProperties(verified, { forceNotRequired: true });
  for (const result of [fromWorkflow, fromOnline]) {
    assert.equal(result["Google Maps netreba"], true);
    assert.equal(result["GEO stav"], "NOT_REQUIRED");
    assert.equal(result["Latitude"], null);
    assert.equal(result["Google Place ID"], "");
  }
  assert.equal(notionGeoMirrorProperties({
    ...verified, google_maps_action: "GOOGLE_MAPS_REQUIRED_AGAIN",
  })["Google Maps netreba"], false);
});

test("blank or out-of-range coordinates do not silently become 0,0", () => {
  assert.equal(notionGeoMirrorProperties({
    ...verified, geo_latitude: "", geo_longitude: "",
  })["Google miesto aktuálne"], false);
  assert.equal(notionGeoMirrorProperties({
    ...verified, geo_latitude: 999,
  })["Latitude"], null);
});

test("read-only mirror patch is minimal and idempotent", () => {
  const desired = notionGeoMirrorProperties(verified);
  assert.deepEqual(notionGeoMirrorChanges(desired, { ...desired }, "events"), {});
  assert.deepEqual(notionGeoMirrorChanges(desired, {
    ...desired, "Google Place ID": "", "Google miesto aktuálne": false,
  }, "events"), {
    "Google Place ID": "ChIJ-confirmed",
    "Google miesto aktuálne": true,
  });
  assert.deepEqual(notionGeoMirrorChanges({ ...desired, Adresa: "Verejná 1" }, {
    ...desired, Adresa: "Stará",
  }, "events"), {});
  assert.deepEqual(notionGeoMirrorChanges({ ...desired, Adresa: "Verejná 1" }, {
    ...desired, Adresa: "Stará",
  }, "organizations"), { Adresa: "Verejná 1" });
});

test("geo sync stays outside bidirectional editorial snapshots and blocks invalid reverse-write", async () => {
  const sync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const adapters = await readFile(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
  const sources = await readFile(new URL("../lib/notion-bulk-sources.ts", import.meta.url), "utf8");
  assert.match(sync, /notionGeoMirrorChanges\(desired, current/);
  assert.match(sync, /input\.mode !== "sync"\) continue/);
  assert.match(sync, /editableSnapshot\(input\.definition\.key/);
  assert.match(adapters, /GOOGLE_PLACE_LOCATION_LOCKED/);
  assert.match(adapters, /hasCurrentGooglePlace/);
  assert.match(sources, /geo\.managed_event_id/);
  assert.match(sources, /geo\.organization_location_id/);
  assert.match(sources, /loc\.role='SITE'/);
});
