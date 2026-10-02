import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const directoryStore = read("lib/directory-store.ts");
const confirmation = read("lib/admin-google-place-confirmation.ts");
const geoStore = read("lib/geo-store.ts");
const provider = read("lib/google-places-provider.ts");
const operator = read("lib/geo-admin-operator.ts");
const bulk = read("lib/google-place-bulk.ts");
const dashboard = read("components/admin-geo-operator-dashboard.tsx");
const organizationEditor = read("components/admin-organization-locations.tsx");
const organizationWrite = read("lib/organization-location-admin-write.ts");
const organizationWorkflow = read("lib/organization-google-maps-workflow.ts");
const organizationPublic = read("lib/help-organization-store.ts");
const organizationProfile = read("components/organization-profile-detail.tsx");
const mapQuery = read("lib/map-query.ts");
const eventSource = read("lib/geo-admin-operator.ts");

test("Google directory write uses a location-only SQL contract and preserves contacts byte-for-byte", () => {
  const start = directoryStore.indexOf("export async function updateManagedDirectoryProfileLocationFromGooglePlace");
  const end = directoryStore.indexOf("export async function setManagedDirectoryProfileReviewed", start);
  assert.ok(start >= 0 && end > start);
  const helper = directoryStore.slice(start, end);

  assert.match(helper, /UPDATE directory_profiles/);
  assert.match(helper, /SET region = \?, district = \?, city = \?, address = \?/);
  assert.doesNotMatch(
    helper,
    /public_phone|public_email|website_url|facebook_url|instagram_url|source_data_json|description\s*=|services_json\s*=|price|image|seo/i,
  );

  const updateSql = helper.match(/UPDATE directory_profiles[\s\S]*?RETURNING \*/)?.[0];
  assert.ok(updateSql, "production location-only UPDATE must stay extractable");

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE directory_profiles (
        id INTEGER PRIMARY KEY,
        region TEXT, district TEXT, city TEXT, address TEXT, postal_code TEXT, street TEXT, house_number TEXT,
        address_format TEXT, service_address_confirmation TEXT, search_text TEXT, updated_at TEXT, updated_by TEXT,
        public_phone TEXT, public_email TEXT, website_url TEXT, facebook_url TEXT, instagram_url TEXT
      );
    `);
    const before = {
      public_phone: "+421 905 123 456",
      public_email: "Kontakt+MAPS@example.sk",
      website_url: "https://example.sk/?keep=%2B421",
      facebook_url: "https://facebook.com/example?ref=unchanged",
      instagram_url: "https://instagram.com/example_%C5%A1",
    };
    sqlite.prepare(`
      INSERT INTO directory_profiles (
        id,region,district,city,address,postal_code,street,house_number,address_format,
        service_address_confirmation,search_text,updated_at,updated_by,
        public_phone,public_email,website_url,facebook_url,instagram_url
      ) VALUES (1,'Old region','Old district','Old city','Old address','','','','','','old search','','',
        ?,?,?,?,?)
    `).run(
      before.public_phone,
      before.public_email,
      before.website_url,
      before.facebook_url,
      before.instagram_url,
    );

    sqlite.prepare(updateSql).get(
      "Nitriansky kraj",
      "Nitra",
      "Nitra",
      "Štefánikova 1, 949 01 Nitra",
      "949 01",
      "Štefánikova",
      "1",
      "STREET",
      "new search",
      "2026-10-02T20:00:00.000Z",
      "admin@example.sk",
      1,
    );

    const after = sqlite.prepare(`
      SELECT address,public_phone,public_email,website_url,facebook_url,instagram_url
      FROM directory_profiles WHERE id=1
    `).get();
    assert.equal(after.address, "Štefánikova 1, 949 01 Nitra");
    for (const field of ["public_phone","public_email","website_url","facebook_url","instagram_url"]) {
      assert.ok(
        Buffer.from(String(after[field]), "utf8").equals(Buffer.from(String(before[field]), "utf8")),
        `${field} changed during Google location update`,
      );
    }
  } finally {
    sqlite.close();
  }

  assert.match(confirmation, /updateManagedDirectoryProfileLocationFromGooglePlace/);
  assert.match(confirmation, /applyGooglePlaceResolution/);
  const resolution = geoStore.slice(
    geoStore.indexOf("export async function applyGooglePlaceResolution"),
    geoStore.indexOf("export async function recordGeocoderFailure"),
  );
  assert.match(resolution, /latitude=\?, longitude=\?/);
  assert.match(resolution, /google_place_id=\?/);
  assert.match(resolution, /provider='google_places'/);
});

test("Google Places provider never requests phone, website or social fields for map workflow", () => {
  assert.match(provider, /places\.id,places\.displayName,places\.formattedAddress,places\.location,places\.addressComponents/);
  assert.doesNotMatch(provider, /nationalPhoneNumber|internationalPhoneNumber|websiteUri|facebook|instagram/i);
});

test("Admin Mapy is a server-side unresolved inbox, including organizations with no location", () => {
  assert.match(operator, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(operator, /FROM help_organizations o[\s\S]*LEFT JOIN organization_location_canonical l ON l\.organization_id = o\.id/);
  assert.match(operator, /ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY l\.organization_id/);
  assert.match(operator, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
  assert.match(operator, /targetId: organizationId/);
  assert.match(eventSource, /WHERE e\.status = 'published' AND e\.cancelled = 0/);
  assert.match(eventSource, /WHEN online = 1 THEN 'NOT_REQUIRED'/);
  assert.doesNotMatch(dashboard, /Operator stav/);
  assert.doesNotMatch(dashboard, /Všetky chyby|Nezobrazuje sa verejne|Neplatná adresa/);
  assert.match(dashboard, /Treba vyriešiť: \{data\.counts\.total\}/);
  assert.match(dashboard, /Služby/);
  assert.match(dashboard, /Pomoc psom/);
  assert.match(dashboard, /Podujatia/);
});

test("Pomoc psom exposes one address and blocks creation of a second organization_location", () => {
  assert.match(organizationEditor, /<h2>Adresa<\/h2>/);
  assert.doesNotMatch(organizationEditor, /ORGANIZATION_LOCATION_ROLES|Typ lokality|Pridať lokalitu|Hlavná lokalita|LEGAL_SEAT|SERVICE_AREA/);
  assert.match(organizationWrite, /WHERE NOT EXISTS \([\s\S]*organization_locations WHERE organization_id = \?/);
  assert.match(organizationWrite, /Organizácia už má adresu/);
  assert.match(organizationWorkflow, /canonicalOrganizationLocation/);
  assert.doesNotMatch(confirmation, /createOrganizationLocationFromAdmin|confirmOrganizationSite/);
  assert.match(organizationPublic, /LIMIT 1/);
  assert.match(organizationPublic, /result\.results\.slice\(0, 1\)/);
  assert.doesNotMatch(organizationProfile, /presentation\.locations\.length > 1/);
  assert.match(mapQuery, /SELECT cl\.id[\s\S]*WHERE cl\.organization_id = o\.id[\s\S]*LIMIT 1/);
});

test("Google bulk remains bounded, cursor-bound and unresolved-only with stop/resume", () => {
  assert.match(bulk, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.match(bulk, /parsed < 1 \|\| parsed > GOOGLE_PLACE_BULK_MAX/);
  assert.match(bulk, /row\.filterFingerprint !== fingerprint/);
  assert.match(bulk, /selectGeoAdminBulkTargets/);
  assert.match(bulk, /operator: "ALL"/);
  assert.match(bulk, /google: "ALL"/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /stopAfterCurrentRef/);
  assert.match(dashboard, /Skontrolovať ďalších/);
  assert.match(dashboard, /✓ Hotovo:/);
  assert.match(dashboard, /⚠ Na kontrolu:/);
  assert.match(dashboard, /○ Nenájdené:/);
  assert.match(dashboard, /✕ Chyby:/);
});

test("NOT_REQUIRED closes an inbox item without touching contact data", () => {
  assert.match(dashboard, /✓ Google Maps netreba/);
  assert.match(dashboard, /google-maps-not-required/);
  const confirmationBlock = confirmation.slice(
    confirmation.indexOf("export async function confirmAdminGooglePlace"),
  );
  assert.doesNotMatch(confirmationBlock, /public_phone|public_email|website_url|facebook_url|instagram_url/);
});

test("workstream adds no schema migration or production mutation mechanism", () => {
  const changedRuntime = [
    directoryStore,
    confirmation,
    operator,
    bulk,
    organizationWrite,
    organizationWorkflow,
    organizationPublic,
    mapQuery,
  ].join("\n");
  assert.doesNotMatch(changedRuntime, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
