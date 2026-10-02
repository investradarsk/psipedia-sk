import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loader = read("lib/geo-admin-operator.ts");
const state = read("lib/geo-admin-operator-state.ts");
const page = read("app/admin/mapy/page.tsx");
const dashboard = read("components/admin-geo-operator-dashboard.tsx");
const geoEditor = read("components/admin-geo-location.tsx");
const picker = read("components/admin-google-place-picker.tsx");
const profileGoogle = read("components/admin-profile-google-maps.tsx");
const discovery = read("lib/google-place-target-discovery.ts");
const route = read("app/api/admin/geo/[targetType]/[id]/route.ts");
const confirmation = read("lib/admin-google-place-confirmation.ts");
const bulk = read("lib/google-place-bulk.ts");
const directoryPage = read("app/admin/adresar/[id]/page.tsx");

test("MAP-ADMIN-UNIFIED loader covers services, one HELP organization row, and events", () => {
  assert.match(loader, /DIRECTORY_PROFILE/);
  assert.match(loader, /ORGANIZATION_LOCATION/);
  assert.match(loader, /MANAGED_EVENT/);
  assert.match(loader, /FROM directory_profiles d/);
  assert.match(loader, /FROM help_organizations o/);
  assert.match(loader, /FROM managed_events e/);
  assert.match(loader, /key: `DIRECTORY_PROFILE:\$\{id\}`/);
  assert.match(loader, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
  assert.match(loader, /key: `MANAGED_EVENT:\$\{id\}`/);
});

test("Admin Mapy keeps only simple URL-backed filters and server pagination", () => {
  for (const param of ["group", "category", "q", "page", "pageSize"]) {
    assert.match(page, new RegExp(`params\\.${param}|params\\[${JSON.stringify(param)}\\]`));
  }
  assert.doesNotMatch(page, /params\.operator|params\.google/);
  assert.match(page, /loadGeoAdminOperatorProfiles/);
  assert.match(loader, /function filterSql/);
  assert.match(loader, /group_key = \?/);
  assert.match(loader, /category = \?/);
  assert.match(loader, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(loader, /search_text LIKE \? COLLATE NOCASE/);
  assert.match(loader, /LIMIT \? OFFSET \?/);
  assert.match(dashboard, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(dashboard, /Zrušiť filtre/);
  assert.doesNotMatch(dashboard, /Operator stav|Všetky mapové stavy/);
});

test("MAP-ADMIN-PERF pagination remains bounded and stable", () => {
  assert.match(loader, /GEO_ADMIN_DEFAULT_PAGE_SIZE = 50/);
  assert.match(loader, /GEO_ADMIN_PAGE_SIZES = \[25, 50, 100\]/);
  assert.match(loader, /GEO_ADMIN_MAX_PAGE_SIZE = 100/);
  assert.match(loader, /parsed > GEO_ADMIN_MAX_PAGE_SIZE/);
  assert.match(loader, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
  assert.doesNotMatch(loader, /LIMIT 2000/);
});

test("counts represent the full unresolved server dataset, not current browser page", () => {
  assert.match(loader, /COUNT\(\*\) AS total/);
  assert.match(loader, /SUM\(CASE WHEN group_key = 'SERVICES' THEN 1 ELSE 0 END\)/);
  assert.match(loader, /SUM\(CASE WHEN group_key = 'HELP' THEN 1 ELSE 0 END\)/);
  assert.match(loader, /SUM\(CASE WHEN group_key = 'EVENTS' THEN 1 ELSE 0 END\)/);
  assert.match(dashboard, /Treba vyriešiť:/);
});

test("Google picker is single-active and mounts only after explicit Admin Mapy click", () => {
  assert.match(picker, /export function AdminGooglePlacePicker/);
  assert.match(dashboard, /activePickerKey/);
  assert.match(dashboard, /pickerOpen = activePickerKey === item\.key/);
  assert.match(dashboard, /pickerOpen && item\.googlePickerAvailable/);
  assert.match(dashboard, /<AdminGooglePlacePicker/);
  assert.match(dashboard, /autoDiscover/);
  assert.match(picker, /if \(!autoDiscover/);
  assert.match(picker, /action: "discover-google-place"/);
  assert.match(picker, /action: "confirm-google-place"/);
  assert.match(geoEditor, /<AdminProfileGoogleMaps/);
  assert.match(profileGoogle, /<AdminGooglePlacePicker/);
});

test("Google confirmation reruns server discovery and never trusts client coordinates", () => {
  assert.match(route, /confirmAdminGooglePlace/);
  assert.match(confirmation, /const candidates = await discoverGoogleTargetPlaces\(source\)/);
  assert.match(confirmation, /candidates\.find\(\(candidate\) => candidate\.id === placeId\)/);
  assert.match(confirmation, /latitude: selected\.latitude/);
  assert.match(confirmation, /longitude: selected\.longitude/);
  assert.doesNotMatch(picker, /latitude:/);
  assert.doesNotMatch(picker, /longitude:/);
});

test("organization Google flow is name-first and no longer exposes or requires location roles", () => {
  const organizationPolicy = discovery.slice(
    discovery.indexOf('if (source.targetType === "ORGANIZATION_LOCATION")'),
    discovery.indexOf('if (source.online)'),
  );
  assert.match(organizationPolicy, /organizationName/);
  assert.doesNotMatch(organizationPolicy, /locationRole !== "SITE"/);
  assert.doesNotMatch(confirmation, /confirmOrganizationSite|createOrganizationLocationFromAdmin|role: "SITE"/);
  assert.doesNotMatch(picker, /LEGAL_SEAT|SERVICE_AREA|SITE/);
});

test("physical events can search by title while online events are system-derived complete", () => {
  assert.match(discovery, /if \(source\.online\)/);
  assert.match(loader, /WHEN online = 1 THEN 'NOT_REQUIRED'/);
  assert.doesNotMatch(dashboard, /online podujatie/);
  assert.match(route, /Online podujatie fyzický Google Place nepotrebuje/);
});

test("map not-required is workflow-only and does not fake geo verification", () => {
  assert.match(route, /action === "google-maps-not-required"/);
  assert.match(route, /setGoogleMapsNotRequired/);
  assert.match(route, /action === "reset-google-maps-not-required"/);
  const notRequiredBlock = route.slice(
    route.indexOf('action === "google-maps-not-required"'),
    route.indexOf('action === "reset-google-maps-not-required"'),
  );
  assert.doesNotMatch(notRequiredBlock, /googlePlaceId|latitude|longitude|applyGooglePlaceResolution|setGeoVisibility/);
});

test("directory privacy/manual-override protections remain intact", () => {
  assert.doesNotMatch(directoryPage, /geoSensitiveDirectoryCategory/);
  assert.match(bulk, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /allowPrivateOverride/);
  assert.match(loader, /explicit_private/);
});

test("bulk stays unified, bounded 1-100 and server cursor-based", () => {
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /bulkCursor/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /Zastaviť po aktuálnej/);
  assert.match(bulk, /selectGooglePlaceBulkTargets/);
  assert.match(bulk, /filterFingerprint/);
  assert.match(bulk, /ORGANIZATION_LOCATION/);
  assert.match(bulk, /MANAGED_EVENT/);
});

test("operator UI stays card-based and technical GEO remains secondary", () => {
  assert.match(state, /geoAdminGenericOperatorState/);
  assert.match(loader, /geoAdminGenericOperatorState/);
  assert.doesNotMatch(dashboard, /<table/);
  assert.match(dashboard, /flexWrap: "wrap"/);
  assert.match(dashboard, /<details/);
  assert.match(page, /Technické GEO detaily/);
});

test("MAP-ADMIN-UNIFIED adds no schema migration or manual-marker default", () => {
  const changedRuntime = [loader, state, dashboard, geoEditor, profileGoogle, picker, discovery, route, confirmation, bulk].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE/);
  assert.doesNotMatch(picker, /manual marker|setManualGeoCoordinates/i);
});
