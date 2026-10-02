import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const profileGoogle = read("components/admin-profile-google-maps.tsx");
const picker = read("components/admin-google-place-picker.tsx");
const geoEditor = read("components/admin-geo-location.tsx");
const directoryPage = read("app/admin/adresar/[id]/page.tsx");
const organizationPage = read("app/admin/organizacie/[id]/page.tsx");
const organizationLocations = read("components/admin-organization-locations.tsx");
const eventPage = read("app/admin/podujatia/[id]/page.tsx");
const eventEditor = read("components/admin-event-editor.tsx");
const geoRoute = read("app/api/admin/geo/[targetType]/[id]/route.ts");
const organizationRoute = read("app/api/admin/organizations/[id]/google-place/route.ts");
const organizationWorkflow = read("lib/organization-google-maps-workflow.ts");
const confirmation = read("lib/admin-google-place-confirmation.ts");
const discovery = read("lib/google-place-target-discovery.ts");
const geoStore = read("lib/geo-store.ts");
const operator = read("lib/geo-admin-operator.ts");
const bulk = read("lib/google-place-bulk.ts");
const quality = read("lib/data-quality-store.ts");

test("PROFILE-GOOGLE-UNIFIED keeps one shared Google Maps component contract", () => {
  assert.match(profileGoogle, /export function AdminProfileGoogleMaps/);
  assert.match(profileGoogle, /<AdminGooglePlacePicker/);
  assert.match(geoEditor, /<AdminProfileGoogleMaps/);
  assert.match(directoryPage, /<AdminGeoLocation targetType="DIRECTORY_PROFILE"/);
  assert.match(organizationPage, /<AdminProfileGoogleMaps/);
  assert.match(eventEditor, /<AdminProfileGoogleMaps targetType="MANAGED_EVENT"/);
});

test("all profile workflows expose simple Google status and NOT_REQUIRED actions", () => {
  for (const label of [
    "🏷️ Google Maps — konkrétne miesto — vybavené",
    "📍 Iba súradnice",
    "✓ Google Maps netreba — vybavené",
    "⚪ Treba vyriešiť",
    "✓ Google Maps netreba — online podujatie",
    "Nájsť profil v Google Maps",
    "✓ Google Maps netreba",
    "Znovu vyžadovať Google Maps",
    "Zmeniť Google miesto",
  ]) assert.ok(profileGoogle.includes(label), label);
});

test("profile Google discovery remains lazy and server-authoritative", () => {
  assert.match(profileGoogle, /fetch\(endpoint, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(profileGoogle, /autoDiscover/);
  assert.match(picker, /onClick=\{\(\) => void discover\(\)\}/);
  assert.match(picker, /action: "discover-google-place"/);
  assert.match(confirmation, /const candidates = await discoverGoogleTargetPlaces\(source\)/);
  assert.match(confirmation, /candidates\.find\(\(candidate\) => candidate\.id === placeId\)/);
  assert.doesNotMatch(picker, /latitude:/);
  assert.doesNotMatch(picker, /longitude:/);
});

test("HELP profile presents one Address section then Google Maps", () => {
  const addressIndex = organizationPage.indexOf("<AdminOrganizationLocations");
  const googleIndex = organizationPage.indexOf("<AdminProfileGoogleMaps");
  assert.ok(addressIndex >= 0 && googleIndex > addressIndex);
  assert.match(organizationLocations, /data-single-address/);
  assert.match(organizationLocations, /<h2>Adresa<\/h2>/);
  assert.doesNotMatch(organizationLocations, />Typ lokality<|>Pridať lokalitu<|>Hlavná lokalita<|>Prevádzka<|>Sídlo<|>Pôsobnosť</);
});

test("HELP discovery uses one deterministic canonical location or organization address fallback", () => {
  assert.match(organizationWorkflow, /canonicalOrganizationLocation/);
  assert.match(organizationWorkflow, /canonicalLocation\?\.id \?\? organization\.id/);
  assert.match(organizationWorkflow, /organizationName: organization\.name/);
  assert.match(organizationWorkflow, /address: canonicalLocation\?\.address \|\| organization\.address \|\| ""/);
  assert.match(discovery, /organizationName, source\.label, source\.address, source\.city, source\.district, source\.region/);
  assert.match(organizationRoute, /discoverOrganizationProfileGooglePlaces/);
});

test("HELP confirmation creates at most the one missing canonical address and never creates a second location", () => {
  assert.match(organizationWorkflow, /if \(!location\)/);
  assert.match(organizationWorkflow, /createOrganizationLocationFromAdmin/);
  assert.match(organizationWorkflow, /isOrganizationLocationMutationConflict/);
  assert.doesNotMatch(confirmation, /createOrganizationLocationFromAdmin|confirmOrganizationSite/);
  assert.doesNotMatch(picker, /SITE|LEGAL_SEAT|SERVICE_AREA|verejne navštevované miesto organizácie/);
});

test("HELP organization NOT_REQUIRED is organization-level and Admin Mapy honors it", () => {
  assert.match(organizationWorkflow, /ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE = "HELP_ORGANIZATION"/);
  assert.match(organizationWorkflow, /GOOGLE_MAPS_NOT_REQUIRED_ACTION/);
  assert.match(operator, /organization_map_review_ranked/);
  assert.match(operator, /resource_type = 'HELP_ORGANIZATION'/);
  assert.match(bulk, /getOrganizationGoogleMapsWorkflowDecision/);
});

test("DIRECTORY NOT_REQUIRED stays canonical", () => {
  assert.match(geoStore, /GOOGLE_MAPS_NOT_REQUIRED_ACTION = "GOOGLE_MAPS_NOT_REQUIRED"/);
  assert.match(quality, /GOOGLE_MAPS_NOT_REQUIRED_SQL/);
  assert.match(operator, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(bulk, /getGoogleMapsWorkflowDecision/);
});

test("EVENT Google workflow remains in location section and online events are system-complete", () => {
  const locationSection = eventEditor.indexOf("<h2>Miesto a organizátor</h2>");
  const googleBlock = eventEditor.indexOf('<AdminProfileGoogleMaps targetType="MANAGED_EVENT"');
  assert.ok(locationSection >= 0 && googleBlock > locationSection);
  assert.doesNotMatch(eventPage, /AdminGeoLocation/);
  assert.match(geoRoute, /googleMapsNotRequiredSystemDerived/);
  assert.match(profileGoogle, /systemNotRequired/);
  assert.ok(discovery.includes("Online podujatie nemá fyzický Google Maps bod."));
});

test("manual override and explicit-private protections remain fail-closed", () => {
  assert.match(confirmation, /point\?\.manualOverride/);
  assert.match(confirmation, /hasExplicitPrivateGeoDecision/);
  assert.match(confirmation, /publicLocation && explicitPrivate && !allowPrivateOverride/);
  assert.match(profileGoogle, /manualOverride/);
  assert.match(profileGoogle, /blockedByPrivate/);
});

test("workflow adds no schema mutation", () => {
  const changedRuntime = [profileGoogle, geoRoute, organizationRoute, organizationWorkflow, confirmation, operator, bulk].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE/);
});
