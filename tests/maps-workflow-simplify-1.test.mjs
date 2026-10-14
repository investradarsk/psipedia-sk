import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

test("A: location-only Google SQL preserves phone/email/website/Facebook/Instagram BYTE-FOR-BYTE", () => {
  const start = directory.indexOf("export async function updateManagedDirectoryProfileLocationFromGooglePlace");
  const end = directory.indexOf("export async function setManagedDirectoryProfileReviewed", start);
  const block = directory.slice(start, end);
  const sqlStart = block.indexOf("UPDATE directory_profiles");
  const sqlEnd = block.indexOf("`).bind(", sqlStart);
  assert.ok(sqlStart >= 0 && sqlEnd > sqlStart, "location-only UPDATE SQL must be extractable from the runtime helper");
  const locationOnlySql = block.slice(sqlStart, sqlEnd).trim();

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      region TEXT, district TEXT, city TEXT, address TEXT, postal_code TEXT,
      street TEXT, house_number TEXT, address_format TEXT, service_address_confirmation TEXT,
      search_text TEXT, updated_at TEXT, updated_by TEXT,
      website_url TEXT, internal_email TEXT, source_data_json TEXT
    )
  `);

  const before = {
    phone: "+421 905 123 456  ",
    email: "kontakt+maps@example.sk",
    website: "https://example.sk/path?x=1&y=2",
    facebook: "https://www.facebook.com/example.sk/",
    instagram: "https://www.instagram.com/example.sk/",
  };
  const sourceData = JSON.stringify({
    "Telefón": before.phone,
    "E-mail": before.email,
    "Facebook": before.facebook,
    "Instagram": before.instagram,
    "Poznámka": "Žiadna normalizácia kontaktov pri Google Maps",
  });

  db.prepare(`
    INSERT INTO directory_profiles (
      id, region, district, city, address, postal_code, street, house_number,
      address_format, service_address_confirmation, search_text, updated_at, updated_by,
      website_url, internal_email, source_data_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    7, "Starý kraj", "Starý okres", "Staré mesto", "Stará 1", "00000", "Stará", "1",
    "STREET", "LEGACY_UNCONFIRMED", "old", "2026-01-01T00:00:00.000Z", "old@example.sk",
    before.website, "internal@example.sk", sourceData,
  );

  db.prepare(locationOnlySql).get(
    "Nitriansky kraj", "Nitra", "Nitra", "Hlavná 22", "94901", "Hlavná", "22",
    "STREET", "new search", "2026-10-02T20:00:00.000Z", "admin@example.sk", 7, "2026-01-01T00:00:00.000Z",
  );

  const after = db.prepare(`
    SELECT address, region, district, city, website_url, source_data_json
    FROM directory_profiles WHERE id = 7
  `).get();
  const stale = db.prepare(locationOnlySql).get(
    "Iný kraj", "Iný okres", "Iné mesto", "Riziková adresa", "99999", "Iná", "99",
    "STREET", "stale search", "2026-10-02T21:00:00.000Z", "other@example.sk", 7, "2026-01-01T00:00:00.000Z",
  );
  assert.equal(stale, undefined, "a concurrent address revision must reject stale Google SQL");
  assert.equal(after.address, "Hlavná 22");
  assert.equal(after.region, "Nitriansky kraj");
  assert.equal(after.district, "Nitra");
  assert.equal(after.city, "Nitra");

  const afterSource = JSON.parse(String(after.source_data_json));
  const exact = (left, right, label) => {
    assert.equal(
      Buffer.compare(Buffer.from(String(left), "utf8"), Buffer.from(String(right), "utf8")),
      0,
      `${label} changed at byte level`,
    );
  };
  exact(afterSource["Telefón"], before.phone, "phone");
  exact(afterSource["E-mail"], before.email, "email");
  exact(after.website_url, before.website, "website");
  exact(afterSource.Facebook, before.facebook, "Facebook");
  exact(afterSource.Instagram, before.instagram, "Instagram");
  assert.match(confirmation, /applyGooglePlaceResolution/);
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


test("Google GEO compare-and-swap uses revision and attempts even with unchanged source fingerprint", () => {
  const geo = read("lib/geo-store.ts");
  const block = geo.slice(geo.indexOf("export async function applyGooglePlaceResolution"), geo.indexOf("export async function recordGeocoderFailure"));
  assert.match(block, /AND updated_at=\? AND attempt_count=\?/);
  assert.match(block, /result\.meta\?\.changes !== 1/);
  assert.match(block, /expectedRevision, expectedAttempt/);
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE geo_points (id INTEGER PRIMARY KEY, source_fingerprint TEXT, updated_at TEXT, attempt_count INTEGER, manual_override INTEGER, public_visibility TEXT, public_precision TEXT, google_place_id TEXT)");
  db.prepare("INSERT INTO geo_points VALUES (1,'same','revision-1',0,0,'EXACT_PUBLIC','EXACT',NULL)").run();
  const sql = "UPDATE geo_points SET google_place_id=?, attempt_count=attempt_count+1, updated_at=? WHERE id=? AND manual_override=0 AND source_fingerprint=? AND public_visibility='EXACT_PUBLIC' AND public_precision='EXACT' AND updated_at=? AND attempt_count=?";
  const first = db.prepare(sql).run("google-one","revision-2",1,"same","revision-1",0);
  const second = db.prepare(sql).run("google-two","revision-3",1,"same","revision-1",0);
  assert.equal(first.changes, 1);
  assert.equal(second.changes, 0);
  assert.equal(db.prepare("SELECT google_place_id FROM geo_points").get().google_place_id,"google-one");
});

test("organization CAS rejects a concurrent textual address update", () => {
  const writer = read("lib/organization-location-admin-write.ts");
  const block = writer.slice(writer.indexOf("export async function updateOrganizationLocationFromGooglePlace"), writer.indexOf("export async function deleteOrganizationLocationFromAdmin"));
  assert.match(block, /address IS \? AND city IS \? AND district IS \? AND region IS \? AND country_code IS \?/);
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE organization_locations (id INTEGER,organization_id INTEGER,address TEXT,city TEXT,district TEXT,region TEXT,country_code TEXT)");
  db.prepare("INSERT INTO organization_locations VALUES (1,2,'Old','Nitra','Nitra','Nitriansky kraj','SK')").run();
  db.prepare("UPDATE organization_locations SET address='Updated by another admin' WHERE id=1").run();
  const result = db.prepare("UPDATE organization_locations SET address=? WHERE id=? AND organization_id=? AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?").run("Google",1,2,"Old","Nitra","Nitra","Nitriansky kraj","SK");
  assert.equal(result.changes,0);
  assert.equal(db.prepare("SELECT address FROM organization_locations").get().address,"Updated by another admin");
});

test("postcommit GEO failure demands repair while precommit CAS conflict does not compensate", () => {
  const confirmation = read("lib/admin-google-place-confirmation.ts");
  assert.match(confirmation,/sourceCommitted/);
  assert.match(confirmation,/GOOGLE_CONFIRMATION_REPAIR_REQUIRED/);
  assert.doesNotMatch(confirmation,/await reconcileGeoAfterSourceMutation\(/);
  assert.match(read("lib/directory-store.ts"),/GOOGLE_SOURCE_COMMITTED_GEO_FAILED/);
  assert.match(read("lib/organization-location-admin-write.ts"),/GOOGLE_SOURCE_COMMITTED_GEO_FAILED/);
});
