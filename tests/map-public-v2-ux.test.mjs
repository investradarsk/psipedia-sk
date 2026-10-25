import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const experience = readFileSync("components/map/map-experience.tsx", "utf8").replace(/\s+/g, " ");
const css = readFileSync("components/map/map-public.module.css", "utf8");
const page = readFileSync("app/mapa/page.tsx", "utf8");

test("one main search field and canonical map filter flow remain", () => {
  assert.match(experience, /Hľadať názov, službu alebo lokalitu/);
  assert.match(experience, /buildMapApiUrl\(viewport, filters\)/);
  assert.match(experience, /serializeMapUiFilters\(filters\)/);
  assert.match(experience, /mapFiltersForCategory\(filters/);
});

test("secondary desktop filters use accessible disclosure", () => {
  assert.match(experience, /aria-expanded=\{desktopFiltersOpen\}/);
  assert.match(experience, /aria-controls="map-desktop-filter-fields"/);
  assert.match(experience, /desktopFiltersOpen \? \(/);
  assert.match(experience, /Ďalšie filtre/);
});

test("public cards omit verified label while protecting approximate navigation", () => {
  assert.doesNotMatch(experience, /Overené/);
  assert.match(experience, /approximate \? null : buildGoogleMapsDirectionsUrl/);
  assert.match(experience, /Približná poloha/);
  assert.match(experience, /Otvoriť približnú polohu v Google Maps/);
});

const sheet = readFileSync("lib/map-mobile-ux.ts", "utf8");

test("keep established cluster, consent, sheet, and request gating", () => {
  assert.match(sheet, /"peek" \| "preview" \| "expanded"/);
  for (const token of [
    "mapClusterTarget",
    "GoogleMapRenderer",
    "hasGoogleMapsConsent",
    "MapRequestGate",
    "scheduleMapRequest",
    "MapSheetState",
    "mapFiltersFromSearchParams",
  ]) {
    assert.ok(experience.includes(token), token);
  }
});

test("compact layout and canonical public map page retained", () => {
  assert.match(css, /grid-template-columns: minmax\(280px, min\(32%, 420px\)\) minmax\(0, 1fr\)/);
  assert.match(css, /desktopFilterToggle:focus-visible/);
  assert.match(page, /path: "\/mapa"/);
  assert.match(page, /publicMapLaunchEnabled/);
});
