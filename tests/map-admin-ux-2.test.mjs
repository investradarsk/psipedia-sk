import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/admin-geo-location.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/geo/[targetType]/[id]/route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/geo-service.ts", import.meta.url), "utf8");

test("MAP-ADMIN-UX-2 keeps directory geo inside the address section", () => {
  assert.match(component, /document\.getElementById\("directory-location"\)/);
  assert.match(component, /createPortal\(panel, portalTarget\)/);
  assert.match(component, /Poloha na mape/);
});

test("primary admin flow exposes simple Slovak controls and hides coordinate editing", () => {
  assert.match(component, /Verejná poloha/);
  assert.match(component, /Nájsť polohu podľa adresy/);
  assert.match(component, /Potvrdiť polohu/);
  assert.match(component, /Hľadať znova/);
  assert.match(component, /Nájdená adresa v Google Maps/);
  assert.match(component, /Nájdená iba poloha/);
  assert.doesNotMatch(component, /htmlFor=\{\`geo-lat-/);
  assert.doesNotMatch(component, /htmlFor=\{\`geo-lng-/);
  assert.doesNotMatch(component, />Precision</);
  assert.doesNotMatch(component, /Uložiť manual marker/);
  assert.doesNotMatch(component, /Verejná mapa ešte nie je zapnutá/);
});

test("privacy-sensitive directory categories default to private without removing explicit control", () => {
  assert.match(component, /useState\(!sensitive\)/);
  assert.match(component, /bezpečný predvolený stav neverejný/);
  assert.match(component, /<option value="yes">Áno<\/option>/);
  assert.match(component, /<option value="no">Nie<\/option>/);
});

test("stale source is explained without technical enum copy", () => {
  assert.match(component, /Adresa sa zmenila\.<\/strong> Poloha na mape potrebuje nové overenie/);
  assert.match(component, /Nájsť polohu znova/);
});

test("location search is a no-write preview until explicit confirmation", () => {
  assert.match(route, /action === "preview"/);
  assert.match(route, /previewGeoSource\(\{ source, visibility: "EXACT_PUBLIC", precision: "EXACT" \}\)/);
  assert.match(route, /action === "confirm-preview"/);
  assert.match(route, /sourceFingerprint/);
  assert.match(route, /applyGeocoderResolution/);
  assert.match(route, /setGeoVisibility/);
  assert.match(service, /export async function previewGeoSource/);
});

test("Google Maps address claim is backed by existing Places API matching", () => {
  assert.match(route, /searchGooglePlacesText/);
  assert.match(route, /evaluateGooglePlaceCandidates/);
  assert.match(route, /match\.decision === "MATCH"/);
  assert.match(route, /status: "CONFIRMED"/);
  assert.match(route, /status: "NOT_CONFIRMED"/);
  assert.match(route, /status: "UNAVAILABLE"/);
  assert.match(route, /googlePlacesApiKey/);
});

test("confirmation reuses existing geo_points and Google Place contracts", () => {
  assert.match(route, /initializeGeoPointForTarget/);
  assert.match(route, /applyGeocoderResolution/);
  assert.match(route, /autoAssignGooglePlaceForDirectoryProfile/);
  assert.doesNotMatch(route, /CREATE TABLE|ALTER TABLE|migration/i);
});

test("admin map preview reuses the existing Google renderer and live launch config", () => {
  assert.match(component, /GoogleMapRenderer/);
  assert.match(component, /minHeight: 320/);
  assert.match(route, /googleMapsRendererConfigured/);
  assert.match(route, /publicMapLaunchEnabled/);
  assert.doesNotMatch(route, /publicMapEnabled:\s*false/);
});
