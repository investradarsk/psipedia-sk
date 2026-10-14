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
  const locationOnlySql = block.slice(sqlStart, sqlEnd).trim().replace('${geo.sourceGuard}', 'NOT EXISTS (SELECT 1 FROM geo_points WHERE target_type=\'DIRECTORY_PROFILE\' AND directory_profile_id=?)');

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

  db.exec("CREATE TABLE geo_points (target_type TEXT, directory_profile_id INTEGER)");

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
    "STREET", "new search", "2026-10-02T20:00:00.000Z", "admin@example.sk", 7, "2026-01-01T00:00:00.000Z", 7,
  );

  const after = db.prepare(`
    SELECT address, region, district, city, website_url, source_data_json
    FROM directory_profiles WHERE id = 7
  `).get();
  const stale = db.prepare(locationOnlySql).get(
    "Iný kraj", "Iný okres", "Iné mesto", "Riziková adresa", "99999", "Iná", "99",
    "STREET", "stale search", "2026-10-02T21:00:00.000Z", "other@example.sk", 7, "2026-01-01T00:00:00.000Z", 7,
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

test("Google resolution requires the caller-observed GEO revision, not a newer read", () => {
  const geo = read("lib/geo-store.ts");
  const confirmation = read("lib/admin-google-place-confirmation.ts");
  const start = geo.indexOf("export async function applyGooglePlaceResolution");
  const end = geo.indexOf("export async function recordGeocoderFailure", start);
  const source = geo.slice(start, end);
  assert.match(source, /input\.expectedGeoRevision !== undefined && current\.updatedAt !== input\.expectedGeoRevision/);
  assert.match(confirmation, /expectedGeoRevision: point\.updatedAt/);
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE geo_points (id INTEGER PRIMARY KEY, updated_at TEXT, attempt_count INTEGER, manual_override INTEGER, public_visibility TEXT, public_precision TEXT)");
  db.prepare("INSERT INTO geo_points VALUES(1,'old',0,0,'EXACT_PUBLIC','EXACT')").run();
  db.prepare("UPDATE geo_points SET updated_at='new',public_visibility='HIDDEN',public_precision=NULL WHERE id=1").run();
  const result = db.prepare("UPDATE geo_points SET attempt_count=attempt_count+1 WHERE id=? AND updated_at=? AND manual_override=0 AND public_visibility='EXACT_PUBLIC' AND public_precision='EXACT'").run(1,"old");
  assert.equal(result.changes,0);
  assert.equal(db.prepare("SELECT public_visibility FROM geo_points WHERE id=1").get().public_visibility,"HIDDEN");
});

test("actual visibility SQL CAS rejects newer HIDDEN and manual decisions", () => {
  const source = read("lib/geo-store.ts");
  const section = source.slice(source.indexOf("export async function setGeoVisibility"), source.indexOf("export async function setManualGeoCoordinates"));
  const statements = [...section.matchAll(/UPDATE geo_points SET([\s\S]*?)`\)\.bind\(/g)].map(m => "UPDATE geo_points SET" + m[1]);
  assert.equal(statements.length, 3);
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE geo_points (
    id INTEGER PRIMARY KEY, public_visibility TEXT, public_precision TEXT, latitude REAL, longitude REAL,
    resolution_method TEXT,provider TEXT,provenance TEXT,source_license TEXT,
    normalized_query TEXT,query_fingerprint TEXT,source_fingerprint TEXT,resolved_source_fingerprint TEXT,
    geocode_status TEXT,last_error_code TEXT,last_error_at TEXT,retry_after_at TEXT,
    manual_override INTEGER,manual_updated_at TEXT,manual_updated_by TEXT,updated_at TEXT,
    attempt_count INTEGER,last_geocoded_at TEXT)`);
  db.prepare("INSERT INTO geo_points (id,public_visibility,public_precision,source_fingerprint,updated_at,manual_override,attempt_count) VALUES (1,'EXACT_PUBLIC','EXACT','same','one',0,0)").run();
  const sql = statements[2];
  const params = ["EXACT_PUBLIC","EXACT",null,null,"same","two",1,"one",0,"EXACT_PUBLIC","EXACT","same",0];
  db.prepare("UPDATE geo_points SET public_visibility='HIDDEN',public_precision=NULL,updated_at='other' WHERE id=1").run();
  assert.equal(db.prepare(sql).run(...params).changes,0);
  db.prepare("UPDATE geo_points SET public_visibility='EXACT_PUBLIC',public_precision='EXACT',updated_at='one',manual_override=1 WHERE id=1").run();
  assert.equal(db.prepare(sql).run(...params).changes,0);
  assert.equal(db.prepare("SELECT manual_override FROM geo_points").get().manual_override,1);
});


test("transactional D1 source updates invalidate real public map SQL for all target types", () => {
  const geoCode = read("lib/geo-store.ts");
  const mapCode = read("lib/map-query.ts");
  const tick = String.fromCharCode(96);
  const interpolation = String.fromCharCode(36,123) + "geo.sourceGuard}";
  const whereStart = mapCode.indexOf("const GEO_PUBLIC_WHERE = ") + "const GEO_PUBLIC_WHERE = ".length + 1;
  const publicSql = mapCode.slice(whereStart, mapCode.indexOf(tick,whereStart));
  assert.match(publicSql,/resolved_source_fingerprint/);
  const invalidationSection = geoCode.slice(geoCode.indexOf("export async function prepareGoogleSourceGeoInvalidation"));
  const invalidationStart = invalidationSection.indexOf("UPDATE geo_points SET");
  const invalidationEnd = invalidationSection.indexOf(tick + ").bind(now",invalidationStart);
  assert.ok(invalidationStart>=0 && invalidationEnd>invalidationStart);
  const invalidationTemplate=invalidationSection.slice(invalidationStart,invalidationEnd);
  const revision="updated_at IS ? AND manual_override=? AND public_visibility IS ? AND public_precision IS ? AND source_fingerprint IS ? AND attempt_count=?";
  for(const [kind,column,table,code,startToken,binds] of [
    ["DIRECTORY_PROFILE","directory_profile_id","directory_profiles",directory,"UPDATE directory_profiles",["Region","District","City","New address","94901","Street","22","STREET","search","r1","admin",7,"r0"]],
    ["MANAGED_EVENT","managed_event_id","managed_events",read("lib/event-store.ts"),"UPDATE managed_events SET city=?",["City","Region","New address","r1","admin",7,"r0"]],
    ["ORGANIZATION_LOCATION","organization_location_id","organization_locations",read("lib/organization-location-admin-write.ts"),"UPDATE organization_locations",["New address","City","District","Region","SK",7,3,"Old address","City","District","Region","SK"]],
  ]) {
    const runScenario=(options={})=>{
      const db=new DatabaseSync(":memory:");
      db.exec("CREATE TABLE geo_points (id INTEGER PRIMARY KEY,target_type TEXT,directory_profile_id INTEGER,managed_event_id INTEGER,organization_location_id INTEGER,latitude REAL,longitude REAL,source_fingerprint TEXT,resolved_source_fingerprint TEXT,google_place_source_fingerprint TEXT,updated_at TEXT,attempt_count INTEGER,manual_override INTEGER,public_visibility TEXT,public_precision TEXT,geocode_status TEXT,last_error_code TEXT,last_error_at TEXT,retry_after_at TEXT)");
      db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,region TEXT,district TEXT,city TEXT,address TEXT,postal_code TEXT,street TEXT,house_number TEXT,address_format TEXT,service_address_confirmation TEXT,search_text TEXT,updated_at TEXT,updated_by TEXT)");
      db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY,city TEXT,region TEXT,address TEXT,updated_at TEXT,updated_by TEXT)");
      db.exec("CREATE TABLE organization_locations (id INTEGER PRIMARY KEY,organization_id INTEGER,address TEXT,city TEXT,district TEXT,region TEXT,country_code TEXT)");
      db.exec("INSERT INTO directory_profiles (id,region,district,city,address,updated_at) VALUES (7,'Region','District','City','Old address','r0')");
      db.exec("INSERT INTO managed_events (id,city,region,address,updated_at) VALUES (7,'City','Region','Old address','r0')");
      db.exec("INSERT INTO organization_locations VALUES (7,3,'Old address','City','District','Region','SK')");
      if(!options.noGeo) db.prepare("INSERT INTO geo_points (id,target_type,"+column+",latitude,longitude,source_fingerprint,resolved_source_fingerprint,updated_at,attempt_count,manual_override,public_visibility,public_precision,geocode_status) VALUES (100,?,7,48.1,18.2,'old','old','g0',0,0,'EXACT_PUBLIC','EXACT','RESOLVED')").run(kind);
      const canonicalSection=code.slice(code.indexOf(kind==="DIRECTORY_PROFILE"?"export async function updateManagedDirectoryProfileLocationFromGooglePlace":kind==="MANAGED_EVENT"?"export async function updateManagedEventLocationFromGooglePlace":"export async function updateOrganizationLocationFromGooglePlace"));
      const start=canonicalSection.indexOf(startToken);
      const end=canonicalSection.indexOf(tick+").bind(",start);
      assert.ok(start>=0 && end>start,kind+" runtime source SQL");
      const key="target_type='"+kind+"' AND "+column+"=?";
      const guard=options.noGeo?"NOT EXISTS (SELECT 1 FROM geo_points WHERE "+key+")":"EXISTS (SELECT 1 FROM geo_points WHERE "+key+" AND "+revision+")";
      const sourceSql=canonicalSection.slice(start,end).replace(interpolation,guard);
      const sourceArgs=[...binds,7,...(options.noGeo?[]:["g0",0,"EXACT_PUBLIC","EXACT","old",0])];
      let postSql,postArgs;
      if(kind==="ORGANIZATION_LOCATION"){postSql="SELECT 1 FROM organization_locations WHERE id=? AND organization_id=? AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?";postArgs=[7,3,"New address","City","District","Region","SK"];}
      else {postSql="SELECT 1 FROM "+table+" WHERE id=? AND updated_at=?";postArgs=[7,"r1"];}
      const inv=options.noGeo?null:invalidationTemplate
        .replace(String.fromCharCode(36,123)+"key}",key)
        .replace(String.fromCharCode(36,123)+"revision}",revision)
        .replace(/\$\{postCommitSourceCheck \? [^\n]+\}/,"AND EXISTS ("+postSql+")");
      const invArgs=["g1",7,"g0",0,"EXACT_PUBLIC","EXACT","old",0,...postArgs];
      const map=()=>db.prepare("SELECT g.id FROM geo_points g JOIN "+table+" s ON s.id=g."+column+" WHERE g.target_type=? AND "+publicSql+" AND g.public_visibility='EXACT_PUBLIC' AND g.public_precision='EXACT'").all(kind);
      function batch(fail=false) {
        db.exec("BEGIN");
        try{
          const changed=kind==="ORGANIZATION_LOCATION"?db.prepare(sourceSql).run(...sourceArgs).changes:db.prepare(sourceSql).all(...sourceArgs).length;
          if(fail) throw new Error("SIMULATED_GEO_FAILURE");
          const invalidated=inv?db.prepare(inv).run(...invArgs).changes:0;
          db.exec("COMMIT");return {changed,invalidated};
        }catch(error){db.exec("ROLLBACK");throw error;}
      }
      return {db,batch,map};
    };
    const successful=runScenario();
    assert.equal(successful.map().length,1,kind+" preexisting pin");
    assert.deepEqual(successful.batch(),{changed:1,invalidated:1},kind);
    assert.deepEqual(successful.map(),[],kind+" no stale public pin after address commit");
    assert.equal(successful.db.prepare("SELECT address FROM "+table+" WHERE id=7").get().address,"New address");
    const rolledBack=runScenario();
    assert.throws(()=>rolledBack.batch(true),/SIMULATED_GEO_FAILURE/);
    assert.equal(rolledBack.db.prepare("SELECT address FROM "+table+" WHERE id=7").get().address,"Old address");
    assert.equal(rolledBack.map().length,1);
    for(const decision of ["public_visibility='HIDDEN',public_precision=NULL,updated_at='g2'","manual_override=1,updated_at='g2'","source_fingerprint='different'","updated_at='g2'"]){
      const concurrent=runScenario();
      concurrent.db.exec("UPDATE geo_points SET "+decision+" WHERE id=100");
      assert.deepEqual(concurrent.batch(),{changed:0,invalidated:0},kind+" stale source rejected: "+decision);
      assert.equal(concurrent.db.prepare("SELECT address FROM "+table+" WHERE id=7").get().address,"Old address");
    }
    const noGeo=runScenario({noGeo:true});
    assert.deepEqual(noGeo.batch(),{changed:1,invalidated:0});
    assert.deepEqual(noGeo.map(),[]);
  }
});
