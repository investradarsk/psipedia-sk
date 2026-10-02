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

test("PROFILE-GOOGLE-UNIFIED uses one shared profile Google Maps component contract", () => {
  assert.match(profileGoogle, /export function AdminProfileGoogleMaps/);
  assert.match(profileGoogle, /<AdminGooglePlacePicker/);
  assert.match(geoEditor, /<AdminProfileGoogleMaps/);
  assert.match(directoryPage, /<AdminGeoLocation targetType="DIRECTORY_PROFILE"/);
  assert.match(organizationPage, /<AdminProfileGoogleMaps/);
  assert.match(eventEditor, /<AdminProfileGoogleMaps targetType="MANAGED_EVENT"/);
});

test("all profile workflows expose unified status and reversible NOT_REQUIRED actions", () => {
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
  ]) {
    assert.ok(profileGoogle.includes(label), label);
  }
  assert.match(geoRoute, /getGoogleMapsWorkflowDecision/);
});

test("profile Google discovery stays lazy and candidates remain server-authoritative", () => {
  assert.match(profileGoogle, /fetch\(endpoint, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(profileGoogle, /autoDiscover/);
  assert.match(picker, /onClick=\{\(\) => void discover\(\)\}/);
  assert.match(picker, /action: "discover-google-place"/);
  assert.match(confirmation, /const candidates = await discoverGoogleTargetPlaces\(source\)/);
  assert.match(confirmation, /candidates\.find\(\(candidate\) => candidate\.id === placeId\)/);
  assert.doesNotMatch(picker, /latitude:/);
  assert.doesNotMatch(picker, /longitude:/);
  assert.match(discovery, /slice\(0, 5\)/);
});

test("HELP profile exposes one Address section followed by organization-level Google Maps", () => {
  const addressIndex = organizationPage.indexOf("<AdminOrganizationLocations");
  const googleIndex = organizationPage.indexOf("<AdminProfileGoogleMaps");
  assert.ok(addressIndex >= 0 && googleIndex > addressIndex);
  assert.ok(organizationPage.includes("/api/admin/organizations/"));
  assert.ok(organizationPage.includes("/google-place"));
  assert.match(organizationLocations, /<h2>Adresa<\/h2>/);
  assert.doesNotMatch(organizationLocations, /ORGANIZATION_LOCATION_ROLES|Typ lokality|Pridať lokalitu|Hlavná lokalita/);
});

test("HELP discovery uses one deterministic canonical address or organization address fallback", () => {
  assert.match(organizationWorkflow, /canonicalOrganizationLocation/);
  assert.ok(organizationWorkflow.includes("targetId: canonicalLocation?.id ?? organization.id"));
  assert.ok(organizationWorkflow.includes("organizationName: organization.name"));
  assert.ok(organizationWorkflow.includes("address: canonicalLocation?.address || organization.address ||"));
  assert.ok(organizationWorkflow.includes("city: canonicalLocation?.city || organization.city"));
  assert.match(discovery, /organizationName, source\.label, source\.address, source\.city, source\.district, source\.region/);
  assert.match(organizationRoute, /discoverOrganizationProfileGooglePlaces/);
});

test("HELP confirmation reuses the canonical row and creates only the first address when none exists", () => {
  assert.match(organizationWorkflow, /let location = state\.canonicalLocation/);
  assert.match(organizationWorkflow, /if \(!location\)/);
  assert.match(organizationWorkflow, /createOrganizationLocationFromAdmin/);
  assert.match(organizationWorkflow, /isOrganizationLocationMutationConflict/);
  assert.doesNotMatch(confirmation, /createOrganizationLocationFromAdmin|confirmOrganizationSite/);
  assert.doesNotMatch(picker, /SITE|LEGAL_SEAT|SERVICE_AREA|verejne navštevované miesto organizácie/);
});

test("HELP canonical address selection is deterministic and repeated confirmation cannot create a second address", () => {
  assert.match(organizationWorkflow, /CASE|SITE|Number\(right\.isPrimary\) - Number\(left\.isPrimary\)/);
  assert.match(organizationWorkflow, /left\.sortOrder - right\.sortOrder/);
  assert.match(organizationWorkflow, /left\.id - right\.id/);
  assert.match(organizationWorkflow, /state = await loadOrganizationGoogleMapsProfile\(input\.organizationId\)/);
  assert.match(organizationWorkflow, /let location = state\.canonicalLocation/);
  assert.match(organizationLocations, /method: location \? "PUT" : "POST"/);
});

test("HELP organization NOT_REQUIRED reuses moderation audit model and Admin Mapy plus bulk honor it", () => {
  assert.match(organizationWorkflow, /ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE = "HELP_ORGANIZATION"/);
  assert.match(organizationWorkflow, /GOOGLE_MAPS_NOT_REQUIRED_ACTION/);
  assert.match(organizationWorkflow, /GOOGLE_MAPS_REQUIRED_AGAIN_ACTION/);
  assert.match(organizationWorkflow, /INSERT INTO moderation_events/);
  assert.match(organizationWorkflow, /changed_fields_json/);
  assert.doesNotMatch(organizationWorkflow, /INSERT INTO geo_points/);
  assert.match(operator, /organization_map_review_ranked/);
  assert.match(operator, /resource_type = 'HELP_ORGANIZATION'/);
  assert.match(operator, /organization_map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED'/);
  assert.match(bulk, /getOrganizationGoogleMapsWorkflowDecision/);
  assert.ok(bulk.includes("Google Maps boli vybavené na úrovni organizácie."));
});

test("DIRECTORY NOT_REQUIRED stays canonical and keeps Kvalita údajov plus bulk integration", () => {
  assert.match(geoStore, /GOOGLE_MAPS_NOT_REQUIRED_ACTION = "GOOGLE_MAPS_NOT_REQUIRED"/);
  assert.match(geoStore, /changedFields: \["google_maps_workflow"\]/);
  assert.match(quality, /GOOGLE_MAPS_NOT_REQUIRED_SQL/);
  assert.match(quality, /mapReviewClosedWithoutGoogle/);
  assert.match(operator, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(bulk, /getGoogleMapsWorkflowDecision/);
});

test("EVENT Google workflow lives in location section and standalone duplicate is removed", () => {
  const locationSection = eventEditor.indexOf("<h2>Miesto a organizátor</h2>");
  const googleBlock = eventEditor.indexOf('<AdminProfileGoogleMaps targetType="MANAGED_EVENT"');
  assert.ok(locationSection >= 0 && googleBlock > locationSection);
  assert.doesNotMatch(eventPage, /AdminGeoLocation/);
  assert.match(eventEditor, /showGoogleWorkflow=\{false\}/);
});

test("online events are system-derived NOT_REQUIRED and do not expose physical Google search", () => {
  assert.match(geoRoute, /googleMapsNotRequiredSystemDerived/);
  assert.match(profileGoogle, /googleMapsNotRequiredSystemDerived/);
  assert.match(profileGoogle, /systemNotRequired \?/);
  assert.ok(discovery.includes("Online podujatie nemá fyzický Google Maps bod."));
});

test("manual override and explicit-private policies remain fail-closed", () => {
  assert.match(confirmation, /point\?\.manualOverride/);
  assert.match(confirmation, /hasExplicitPrivateGeoDecision/);
  assert.match(confirmation, /publicLocation && explicitPrivate && !allowPrivateOverride/);
  assert.match(profileGoogle, /manualOverride/);
  assert.match(profileGoogle, /blockedByPrivate/);
});

test("PROFILE-GOOGLE-UNIFIED adds no schema or fake GEO persistence", () => {
  const changedRuntime = [
    profileGoogle,
    geoRoute,
    organizationRoute,
    organizationWorkflow,
    confirmation,
    operator,
    bulk,
  ].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE/);
  const notRequiredBlock = organizationWorkflow.slice(
    organizationWorkflow.indexOf("setOrganizationGoogleMapsNotRequired"),
    organizationWorkflow.indexOf("resetOrganizationGoogleMapsNotRequired"),
  );
  assert.doesNotMatch(notRequiredBlock, /google_place_id|latitude|longitude|provider|RESOLVED/i);
});
