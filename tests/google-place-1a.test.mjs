import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("GOOGLE-PLACE-1A stores independent location-level Google identity", async () => {
  const [schema, migration, migrator] = await Promise.all([
    read("db/geo-schema.ts"),
    read("migrations/0090_geo_google_place_identity.sql"),
    read("scripts/production-d1-migrate.mjs"),
  ]);
  assert.match(schema, /googlePlaceId: text\("google_place_id"\)/);
  assert.match(schema, /googlePlaceSourceFingerprint: text\("google_place_source_fingerprint"\)/);
  assert.match(schema, /googlePlaceMatchedAt: text\("google_place_matched_at"\)/);
  assert.match(migration, /ALTER TABLE geo_points ADD COLUMN google_place_id TEXT/);
  assert.match(migration, /ALTER TABLE geo_points ADD COLUMN google_place_source_fingerprint TEXT/);
  assert.match(migration, /ALTER TABLE geo_points ADD COLUMN google_place_matched_at TEXT/);
  assert.doesNotMatch(migration, /provider_result_id/i);
  assert.match(migrator, /0090_geo_google_place_identity\.sql/);
  assert.match(migrator, /assertGeoGooglePlaceIdentitySchema/);
});

test("GOOGLE-PLACE-1A public map read is fail-closed for stale Place IDs", async () => {
  const [contract, query] = await Promise.all([
    read("lib/map-contract.ts"),
    read("lib/map-query.ts"),
  ]);
  assert.match(contract, /googlePlaceId\?: string/);
  assert.match(query, /g\.google_place_id, g\.google_place_source_fingerprint/);
  assert.match(query, /candidate\.googlePlaceSourceFingerprint === candidate\.sourceFingerprint/);
  assert.match(query, /item\.googlePlaceId = candidate\.googlePlaceId/);
});

test("GOOGLE-PLACE-1A Maps URLs preserve coordinate fallback and add Place ID when present", async () => {
  const ui = await read("lib/map-public-ui.ts");
  assert.match(ui, /new URLSearchParams\(\{ api: "1", query \}\)/);
  assert.match(ui, /params\.set\("query_place_id", placeId\)/);
  assert.match(ui, /new URLSearchParams\(\{ api: "1", destination \}\)/);
  assert.match(ui, /params\.set\("destination_place_id", placeId\)/);
  assert.match(ui, /googlePlaceId\?\.trim\(\)/);
});

test("GOOGLE-PLACE-1A main and detail maps pass Place ID only to deep-link helpers", async () => {
  const [main, detail, renderer] = await Promise.all([
    read("components/map/map-experience.tsx"),
    read("components/map/public-location-map.tsx"),
    read("components/map/google-map-renderer.tsx"),
  ]);
  assert.match(main, /buildGoogleMapsPlaceUrl\(item\.latitude, item\.longitude, item\.googlePlaceId\)/);
  assert.match(main, /buildGoogleMapsDirectionsUrl\(item\.latitude, item\.longitude, item\.googlePlaceId\)/);
  assert.match(detail, /buildGoogleMapsPlaceUrl\(selected\.latitude, selected\.longitude, selected\.googlePlaceId\)/);
  assert.match(detail, /buildGoogleMapsDirectionsUrl\(selected\.latitude, selected\.longitude, selected\.googlePlaceId\)/);
  assert.doesNotMatch(renderer, /googlePlaceId|google_place|query_place_id|destination_place_id/);
});

test("GOOGLE-PLACE-1A adds no Google Places lookup or Tavily coupling", async () => {
  const sources = (await Promise.all([
    read("lib/map-query.ts"),
    read("lib/map-public-ui.ts"),
    read("components/map/map-experience.tsx"),
    read("components/map/public-location-map.tsx"),
  ])).join("\n");
  assert.doesNotMatch(sources, /places\.googleapis\.com|places:search|Text Search|Nearby Search|Place Details/i);
  assert.doesNotMatch(sources, /TAVILY|tavily/i);
});
