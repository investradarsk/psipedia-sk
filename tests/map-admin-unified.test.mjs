import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loader = read("lib/geo-admin-operator.ts");
const state = read("lib/geo-admin-operator-state.ts");
const dashboard = read("components/admin-geo-operator-dashboard.tsx");
const geoEditor = read("components/admin-geo-location.tsx");
const picker = read("components/admin-google-place-picker.tsx");
const discovery = read("lib/google-place-target-discovery.ts");
const route = read("app/api/admin/geo/[targetType]/[id]/route.ts");
const bulk = read("lib/google-place-bulk.ts");
const directoryPage = read("app/admin/adresar/[id]/page.tsx");

test("MAP-ADMIN-UNIFIED operator loader includes all three canonical target types", () => {
  assert.match(loader, /DIRECTORY_PROFILE/);
  assert.match(loader, /ORGANIZATION_LOCATION/);
  assert.match(loader, /MANAGED_EVENT/);
  assert.match(loader, /FROM directory_profiles d/);
  assert.match(loader, /FROM organization_locations l/);
  assert.match(loader, /FROM managed_events e/);
  assert.match(loader, /key: `DIRECTORY_PROFILE:\$\{id\}`/);
  assert.match(loader, /key: `ORGANIZATION_LOCATION:\$\{id\}`/);
  assert.match(loader, /key: `MANAGED_EVENT:\$\{id\}`/);
});

test("MAP-ADMIN-UNIFIED exposes section, dynamic category and combinable map filters", () => {
  assert.match(dashboard, /Všetko/);
  assert.match(dashboard, /Služby/);
  assert.match(dashboard, /Pomoc psom/);
  assert.match(dashboard, /Podujatia/);
  assert.match(dashboard, /scopedItems/);
  assert.match(dashboard, /categoryOptions/);
  assert.match(dashboard, /selectedCategories/);
  assert.match(dashboard, /selectedMapTargets/);
  assert.match(dashboard, /Google Maps — konkrétne miesto/);
  assert.match(dashboard, /Iba súradnice/);
  assert.match(dashboard, /Bez Google Place \/ bez mapového cieľa/);
  assert.match(dashboard, /Zrušiť všetky filtre/);
});

test("MAP-ADMIN-UNIFIED uses one reusable inline Google Place picker", () => {
  assert.match(picker, /export function AdminGooglePlacePicker/);
  assert.match(picker, /Nájsť v Google Maps/);
  assert.match(picker, /Použiť toto miesto/);
  assert.match(geoEditor, /<AdminGooglePlacePicker/);
  assert.match(dashboard, /<AdminGooglePlacePicker/);
  assert.match(picker, /action: "discover-google-place"/);
  assert.match(picker, /action: "confirm-google-place"/);
});

test("Google confirmation reruns server discovery and never trusts client coordinates", () => {
  assert.match(route, /discoverGoogleTargetPlaces\(source\)/);
  assert.match(route, /candidates\.find\(\(candidate\) => candidate\.id === placeId\)/);
  assert.match(route, /latitude: selected\.latitude/);
  assert.match(route, /longitude: selected\.longitude/);
  assert.doesNotMatch(picker, /latitude:/);
  assert.doesNotMatch(picker, /longitude:/);
});

test("organization privacy allows SITE but blocks legal seat, service area and unclear role", () => {
  assert.match(discovery, /source\.locationRole === "LEGAL_SEAT"/);
  assert.match(discovery, /Právne sídlo sa nezverejňuje ako navštevované miesto/);
  assert.match(discovery, /source\.locationRole === "SERVICE_AREA"/);
  assert.match(discovery, /Pôsobnosť organizácie nie je konkrétne verejne navštevované miesto/);
  assert.match(discovery, /source\.locationRole !== "SITE"/);
  assert.match(discovery, /Najprv označ lokalitu ako verejne navštevované SITE/);
});

test("physical events can use Google Place while online events remain non-physical", () => {
  assert.match(discovery, /if \(source\.online\)/);
  assert.match(discovery, /Online podujatie nemá fyzický Google Maps bod/);
  assert.match(loader, /online[\s\S]*NOT_PUBLIC/);
  assert.match(route, /googlePlaceActionForSource\(source\)/);
});

test("directory sensitive category is not a Google blocker but explicit private state is", () => {
  assert.doesNotMatch(directoryPage, /geoSensitiveDirectoryCategory/);
  assert.doesNotMatch(bulk, /geoSensitiveDirectoryCategory/);
  assert.match(bulk, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /hasExplicitPrivateGeoDecision/);
  assert.match(route, /allowPrivateOverride/);
  assert.match(loader, /explicit_private/);
});

test("directory Google Maps action stays available for hybrid services that also offer online service", () => {
  const directoryPolicy = discovery.slice(
    discovery.indexOf('if (source.targetType === "DIRECTORY_PROFILE")'),
    discovery.indexOf('if (source.targetType === "ORGANIZATION_LOCATION")'),
  );
  assert.doesNotMatch(directoryPolicy, /source\.online/);
  assert.match(directoryPolicy, /!source\.label\.trim\(\)/);
});

test("bulk remains DIRECTORY_PROFILE-only, bounded 1-100 and cursor-based", () => {
  assert.match(dashboard, /targetType === "DIRECTORY_PROFILE"/);
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /bulkCursorId/);
  assert.match(dashboard, /Pokračovať ďalšou dávkou/);
  assert.match(dashboard, /Začať od začiatku/);
  assert.doesNotMatch(bulk, /ORGANIZATION_LOCATION|MANAGED_EVENT/);
});

test("operator UI stays card-based and non-directory state is independent of directory address rules", () => {
  assert.match(state, /geoAdminGenericOperatorState/);
  assert.match(loader, /geoAdminGenericOperatorState/);
  assert.doesNotMatch(dashboard, /<table/);
  assert.match(dashboard, /flexWrap: "wrap"/);
  assert.match(dashboard, /overflow: "hidden"/);
});

test("MAP-ADMIN-UNIFIED adds no schema migration or manual-marker default", () => {
  const changedRuntime = [loader, state, dashboard, geoEditor, picker, discovery, route, bulk].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE/);
  assert.doesNotMatch(picker, /manual marker|setManualGeoCoordinates/i);
});
