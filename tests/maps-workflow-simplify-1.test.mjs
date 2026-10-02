import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const directory = read("lib/directory-store.ts");
const confirmation = read("lib/admin-google-place-confirmation.ts");
const provider = read("lib/google-places-provider.ts");
const operator = read("lib/geo-admin-operator.ts");
const dashboard = read("components/admin-geo-operator-dashboard.tsx");
const organizationWrite = read("lib/organization-location-admin-write.ts");
const organizationUi = read("components/admin-organization-locations.tsx");
const organizationWorkflow = read("lib/organization-google-maps-workflow.ts");
const publicDetail = read("components/organization-profile-detail.tsx");
const publicStore = read("lib/help-organization-store.ts");
const mapQuery = read("lib/map-query.ts");

test("A: Google directory write contract physically owns location fields only", () => {
  const start = directory.indexOf("export async function updateManagedDirectoryProfileLocationFromGooglePlace");
  const end = directory.indexOf("export async function setManagedDirectoryProfileReviewed", start);
  const block = directory.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /UPDATE directory_profiles[\s\S]*SET region = \?, district = \?, city = \?, address = \?/);
  for (const forbidden of ["website_url", "internal_email", "source_data_json", "price_note", "image_url", "seo_json", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl"]) {
    assert.ok(!block.includes(forbidden), `location-only Google write must not own ${forbidden}`);
  }
  assert.match(confirmation, /updateManagedDirectoryProfileLocationFromGooglePlace/);
  assert.doesNotMatch(confirmation, /updateManagedDirectoryProfileFromGooglePlace/);
});

test("A: Google Places provider requests no phone or website business fields", () => {
  assert.match(provider, /places\.id,places\.displayName,places\.formattedAddress,places\.location,places\.addressComponents/);
  assert.doesNotMatch(provider, /nationalPhoneNumber|internationalPhoneNumber|websiteUri/);
});

test("B+D: unresolved inbox excludes PLACE/NOT_REQUIRED/online and only includes published non-cancelled events", () => {
  assert.match(operator, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(operator, /WHEN online = 1 THEN 'NOT_REQUIRED'/);
  assert.match(operator, /WHEN organization_map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED' THEN 'NOT_REQUIRED'/);
  assert.match(operator, /WHEN map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED' THEN 'NOT_REQUIRED'/);
  assert.match(operator, /WHERE e\.status = 'published' AND e\.cancelled = 0/);
  assert.doesNotMatch(dashboard, /Operator stav/);
});

test("C: HELP organization without location remains visible exactly once", () => {
  assert.match(operator, /FROM help_organizations o[\s\S]*LEFT JOIN organization_location_canonical l ON l\.organization_id = o\.id/);
  assert.match(operator, /ROW_NUMBER\(\) OVER[\s\S]*PARTITION BY l\.organization_id/);
  assert.match(operator, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
});

test("C: server prevents a second organization address", () => {
  assert.match(organizationWrite, /WHERE NOT EXISTS \([\s\S]*organization_locations WHERE organization_id = \?/);
  assert.match(organizationWrite, /Organizácia už má adresu\. Uprav existujúcu adresu namiesto pridania ďalšej\./);
});

test("C+F: organization editor exposes Adresa only, not multi-location role controls", () => {
  assert.match(organizationUi, /data-single-address/);
  assert.match(organizationUi, /<h2>Adresa<\/h2>/);
  for (const forbidden of ["Typ lokality", "Pridať lokalitu", "Ďalšia lokalita", "Hlavná lokalita", "Prevádzka", "Sídlo", "Pôsobnosť"]) {
    assert.ok(!organizationUi.includes(forbidden), `organization UI must not expose ${forbidden}`);
  }
});

test("C+F: organization Google workflow reuses canonical address and creates only when none exists", () => {
  assert.match(organizationWorkflow, /canonicalOrganizationLocation/);
  assert.match(organizationWorkflow, /let location = state\.canonicalLocation/);
  assert.match(organizationWorkflow, /if \(!location\)/);
  assert.match(organizationWorkflow, /createOrganizationLocationFromAdmin/);
  assert.match(organizationWorkflow, /isOrganizationLocationMutationConflict/);
});

test("C+16: public organization profile and map expose at most one canonical location", () => {
  assert.doesNotMatch(publicDetail, /presentation\.locations\.length > 1|Kde organizácia pôsobí|Hlavná lokalita/);
  assert.match(publicStore, /buildPublicOrganizationLocationsQuery[\s\S]*LIMIT 1/);
  assert.match(publicStore, /result\.results\.slice\(0, 1\)/);
  assert.match(mapQuery, /WHERE cl\.organization_id = o\.id[\s\S]*LIMIT 1/);
  assert.match(mapQuery, /function scopedOrganizationStatement[\s\S]*LIMIT 1/);
});

test("E: bulk UI and cursor safety remain intact", () => {
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /Zastaviť po aktuálnej/);
  assert.match(dashboard, /Skontrolovať ďalších/);
});

test("F: main Admin Mapy controls are simple", () => {
  assert.match(dashboard, /Kategória/);
  assert.match(dashboard, /Hľadať/);
  assert.match(dashboard, /Na stránku/);
  assert.match(dashboard, /Treba vyriešiť:/);
  assert.doesNotMatch(dashboard, /Operator stav|Všetky chyby|Nezobrazuje sa verejne/);
});
