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

test("MAP-ADMIN-UNIFIED loader includes all three target types while HELP is organization-based", () => {
  assert.match(loader, /DIRECTORY_PROFILE/);
  assert.match(loader, /ORGANIZATION_LOCATION/);
  assert.match(loader, /MANAGED_EVENT/);
  assert.match(loader, /FROM directory_profiles d/);
  assert.match(loader, /FROM help_organizations o/);
  assert.match(loader, /LEFT JOIN organization_location_canonical/);
  assert.match(loader, /FROM managed_events e/);
  assert.match(loader, /key: `DIRECTORY_PROFILE:\$\{id\}`/);
  assert.match(loader, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
  assert.match(loader, /key: `MANAGED_EVENT:\$\{id\}`/);
});

test("Admin Mapy exposes only simple URL-backed filters while unresolved state is server-owned", () => {
  for (const param of ["group", "category", "q", "page", "pageSize"]) {
    assert.match(page, new RegExp(`params\\.${param}|params\\[${JSON.stringify(param)}\\]`));
  }
  assert.doesNotMatch(page, /params\.operator|params\.google/);
  assert.match(page, /loadGeoAdminOperatorProfiles/);
  assert.match(loader, /function filterSql/);
  assert.match(loader, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(loader, /group_key = \?/);
  assert.match(loader, /category = \?/);
  assert.match(loader, /search_text LIKE \? COLLATE NOCASE/);
  assert.match(loader, /LIMIT \? OFFSET \?/);
  assert.match(dashboard, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(dashboard, /Zrušiť filtre/);
  assert.doesNotMatch(dashboard, /Operator stav/);
});

test("MAP-ADMIN-PERF pagination is bounded and stable", () => {
  assert.match(loader, /GEO_ADMIN_DEFAULT_PAGE_SIZE = 50/);
  assert.match(loader, /GEO_ADMIN_PAGE_SIZES = \[25, 50, 100\]/);
  assert.match(loader, /GEO_ADMIN_MAX_PAGE_SIZE = 100/);
  assert.match(loader, /parsed > GEO_ADMIN_MAX_PAGE_SIZE/);
  assert.match(loader, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
  assert.doesNotMatch(loader, /LIMIT 2000/);
  assert.doesNotMatch(loader, /\.filter\(\(item\).*findIndex/s);
  assert.match(dashboard, /data\.pagination\.from/);
  assert.match(dashboard, /data\.pagination\.to/);
});

test("section counts are server-side unresolved counts", () => {
  assert.match(loader, /COUNT\(\*\) AS total/);
  assert.match(loader, /group_services/);
  assert.match(loader, /group_help/);
  assert.match(loader, /group_events/);
  assert.match(dashboard, /Treba vyriešiť: \{data\.counts\.total\}/);
  assert.match(dashboard, /countForGroup/);
  assert.doesNotMatch(dashboard, /Na mape|Všetky chyby|Treba skontrolovať/);
});

test("Google picker is single-active and mounts only after explicit Admin Mapy click", () => {
  assert.match(picker, /export function AdminGooglePlacePicker/);
  assert.match(dashboard, /activePickerKey/);
  assert.match(dashboard, /pickerOpen = activePickerKey === item\.key/);
  assert.match(dashboard, /pickerOpen && item\.googlePickerAvailable/);
  assert.match(dashboard, /<AdminGooglePlacePicker/);
  assert.match(dashboard, /autoDiscover/);
  assert.match(picker, /if \(!autoDiscover/);
  assert.match(picker, /void discover\(\)/);
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

test("organization search and confirmation no longer expose or require location roles", () => {
  const discoveryPolicy = discovery.slice(
    discovery.indexOf('if (source.targetType === "ORGANIZATION_LOCATION")'),
    discovery.indexOf('if (source.online)'),
  );
  assert.match(discoveryPolicy, /organizationName/);
  assert.doesNotMatch(discoveryPolicy, /locationRole !== "SITE"/);
  assert.match(discovery, /googlePlaceConfirmationForSource/);
  assert.doesNotMatch(confirmation, /confirmOrganizationSite|createOrganizationLocationFromAdmin/);
  assert.doesNotMatch(picker, /LEGAL_SEAT|SERVICE_AREA|verejne navštevované/);
});

test("physical events can search by title while online events are system-derived resolved", () => {
  assert.match(discovery, /parts\(source\.label, source\.city, source\.region, "Slovensko"\)/);
  assert.match(discovery, /if \(source\.online\)/);
  assert.match(loader, /WHEN online = 1 THEN 'NOT_REQUIRED'/);
  assert.match(loader, /WHERE e\.status = 'published' AND e\.cancelled = 0/);
  assert.ok(discovery.includes("Online podujatie nemá fyzický Google Maps bod."));
  assert.doesNotMatch(dashboard, /online podujatie/i);
});

test("map not-required is workflow-only and resolved items disappear from Admin Mapy", () => {
  assert.match(route, /action === "google-maps-not-required"/);
  assert.match(route, /setGoogleMapsNotRequired/);
  assert.match(route, /action === "reset-google-maps-not-required"/);
  assert.match(route, /resetGoogleMapsNotRequired/);
  assert.match(dashboard, /✓ Google Maps netreba/);
  assert.match(profileGoogle, /Znovu vyžadovať Google Maps/);
  assert.match(loader, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  const notRequiredBlock = route.slice(
    route.indexOf('action === "google-maps-not-required"'),
    route.indexOf('action === "reset-google-maps-not-required"'),
  );
  assert.doesNotMatch(notRequiredBlock, /googlePlaceId|latitude|longitude|applyGooglePlaceResolution|setGeoVisibility/);
});

test("directory privacy/manual-override protections remain intact and online directory behavior stays removed", () => {
  assert.doesNotMatch(directoryPage, /geoSensitiveDirectoryCategory/);
  assert.doesNotMatch(bulk, /geoSensitiveDirectoryCategory/);
  assert.match(bulk, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /allowPrivateOverride/);
  assert.match(loader, /explicit_private/);
  const directoryPolicy = discovery.slice(
    discovery.indexOf('if (source.targetType === "DIRECTORY_PROFILE")'),
    discovery.indexOf('if (source.targetType === "ORGANIZATION_LOCATION")'),
  );
  assert.doesNotMatch(directoryPolicy, /source\.online/);
});

test("bulk is unified, bounded 1-100, server cursor-based and resumable", () => {
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /bulkCursor/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /stopAfterCurrentRef/);
  assert.match(dashboard, /Skontrolovať ďalších/);
  assert.match(bulk, /selectGooglePlaceBulkTargets/);
  assert.match(bulk, /filterFingerprint/);
  assert.match(bulk, /ORGANIZATION_LOCATION/);
  assert.match(bulk, /MANAGED_EVENT/);
  assert.match(bulk, /lastTargetType/);
  assert.match(bulk, /operator: "ALL"/);
  assert.match(bulk, /google: "ALL"/);
});

test("operator UI stays card-based and hides technical GEO state in details", () => {
  assert.match(state, /geoAdminGenericOperatorState/);
  assert.match(loader, /geoAdminGenericOperatorState/);
  assert.doesNotMatch(dashboard, /<table/);
  assert.match(dashboard, /flexWrap: "wrap"/);
  assert.match(dashboard, /<summary>Technické detaily<\/summary>/);
  assert.match(picker, /maxWidth: "100%"/);
});

test("MAP-ADMIN-UNIFIED adds no schema migration or manual-marker default", () => {
  const changedRuntime = [loader, state, dashboard, geoEditor, profileGoogle, picker, discovery, route, confirmation, bulk].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE/);
  assert.doesNotMatch(picker, /manual marker|setManualGeoCoordinates/i);
});
