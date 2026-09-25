import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  ADDRESS_SOURCE_CRS,
  activationTransition,
  buildMunicipalityMap,
  formatHouseNumber,
  formatPostalCode,
  normalizeCanonicalText,
  normalizePostalCode,
  normalizeSearchText,
  retiredSourceIds,
  rollbackTransition,
  validateAddressFeature,
} from "../scripts/address-reference-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = await fs.readFile(path.join(ROOT, "address-reference/schema.sql"), "utf8");
const mapping = JSON.parse(await fs.readFile(path.join(ROOT, "data/address-reference/municipality-lau2-mapping.json"), "utf8"));
const municipalityById = buildMunicipalityMap(mapping);

function sourceProperties(overrides = {}) {
  return {
    objectid: 4039478,
    uri_identifier: "https://data.gov.sk/id/physical-address/7101062870",
    identifier: "7101062870",
    issuingcountry: "Slovenská republika",
    fulladdress: "Ružinovská,5346/1B,Bratislava-Ružinov,82102",
    geometry_text: "POINT(17.1732892943 48.158818443)",
    streetname: "Ružinovská",
    street_id: "40491",
    postalcode: "82102",
    orientationnumber: "1B",
    propertyregistrationnumber: "5346",
    district_name: null,
    district_id: null,
    lau2_name: "Bratislava-Ružinov",
    lau2_id: "SK0102529320",
    lau1_name: "Bratislava II",
    lau1_id: "SK0102",
    nuts3_name: "Bratislavský",
    nuts3_id: "SK010",
    validfrom: "2020-07-14Z",
    publisher: "Ministerstvo vnútra Slovenskej republiky",
    ico: "00151866",
    annotation: "5346/1B",
    ...overrides,
  };
}

function feature(overrides = {}, coordinates = [17.17328929, 48.15881844]) {
  return { type: "Feature", geometry: { type: "Point", coordinates }, properties: sourceProperties(overrides) };
}

test("municipality mapping is complete, unique, deterministic and has only two reviewed overrides", () => {
  assert.equal(mapping.counts.entries, 2927);
  assert.equal(mapping.counts.exact, 2925);
  assert.equal(mapping.counts.reviewed_overrides, 2);
  assert.equal(mapping.counts.unmapped, 0);
  assert.equal(new Set(mapping.entries.map((row) => row.lau2_id)).size, 2927);
  assert.deepEqual(
    mapping.entries.filter((row) => row.match_method === "EXPLICIT_REVIEWED_OVERRIDE").map((row) => row.psipedia_name).sort(),
    ["Valaškovce (vojenský obvod)", "Záhorie (vojenský obvod)"],
  );
  assert.equal(mapping.entries.some((row) => /FUZZY/i.test(row.match_method)), false);
});

test("canonical/search normalization preserves display diacritics but search is tolerant", () => {
  assert.equal(normalizeCanonicalText("  Štefánikova  "), "Štefánikova");
  assert.equal(normalizeSearchText("  Žitná - Radiša  "), "zitna-radisa");
  assert.equal(normalizePostalCode("953 01"), "95301");
  assert.equal(formatPostalCode("95301"), "953 01");
});

test("STREET address preserves IDs, embedded orientation suffix, postal code and CRS84 lon/lat", () => {
  const row = validateAddressFeature(feature(), municipalityById);
  assert.equal(row.address_format, "STREET");
  assert.equal(row.source_address_id, "7101062870");
  assert.equal(row.street_id, "40491");
  assert.equal(row.orientation_number, "1B");
  assert.equal(formatHouseNumber(row.property_registration_number, row.orientation_number), "5346/1B");
  assert.equal(row.postal_code, "82102");
  assert.equal(row.source_crs, ADDRESS_SOURCE_CRS);
  assert.deepEqual([row.longitude, row.latitude], [17.17328929, 48.15881844]);
});

test("MUNICIPALITY_NUMBER keeps street null and never manufactures a street", () => {
  const row = validateAddressFeature(feature({
    uri_identifier: "https://data.gov.sk/id/physical-address/7103140264",
    identifier: "7103140264",
    fulladdress: "483,Čakajovce,95143",
    streetname: null,
    street_id: null,
    postalcode: "95143",
    orientationnumber: null,
    propertyregistrationnumber: "483",
    lau2_name: "Čakajovce",
    lau2_id: "SK0233500101",
    lau1_name: "Nitra",
    lau1_id: "SK0233",
    nuts3_name: "Nitriansky",
    nuts3_id: "SK023",
    annotation: "483",
  }, [18.0386448, 48.3684542]), municipalityById);
  assert.equal(row.address_format, "MUNICIPALITY_NUMBER");
  assert.equal(row.street_id, null);
  assert.equal(row.street_name, null);
  assert.equal(row.postal_code, "95143");
});

test("invalid geometry, swapped/out-of-Slovakia coordinates and incoherent street data fail closed", () => {
  assert.throws(() => validateAddressFeature({ ...feature(), geometry: { type: "Polygon", coordinates: [] } }, municipalityById), /Point/);
  assert.throws(() => validateAddressFeature(feature({}, [48.15, 17.17]), municipalityById), /longitude/);
  assert.throws(() => validateAddressFeature(feature({ street_id: "40491", streetname: null }), municipalityById), /both present or both null/);
});

test("source schema drift fails on unexpected and missing fields", () => {
  const unexpected = feature();
  unexpected.properties.future_resident_name = "Do not import";
  assert.throws(() => validateAddressFeature(unexpected, municipalityById), /unexpected source properties/);
  const missing = feature();
  delete missing.properties.postalcode;
  assert.throws(() => validateAddressFeature(missing, municipalityById), /missing source properties/);
});

test("ambiguous/missing municipality mapping fails closed", () => {
  const unknown = feature({ lau2_id: "SK9999999999", lau2_name: "Unknown" });
  assert.throws(() => validateAddressFeature(unknown, municipalityById), /unmapped authoritative municipality/);
});

test("source retirement is by stable ID set difference, never fuzzy text", () => {
  assert.deepEqual(retiredSourceIds(["A", "B", "C"], ["B", "C", "D"]), ["A"]);
});

test("activation and rollback transitions preserve previous-good release identity", () => {
  assert.deepEqual(activationTransition({ active_release_id: "r1" }, "r2"), {
    active_release_id: "r2",
    previous_good_release_id: "r1",
  });
  assert.deepEqual(rollbackTransition({ active_release_id: "r2", previous_good_release_id: "r1" }), {
    active_release_id: "r1",
    previous_good_release_id: "r2",
  });
});

test("schema prevents activation before candidate integrity PASS and keeps active release unchanged on failure", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const insert = db.prepare(`INSERT INTO address_dataset_releases
    (id,provider,dataset,catalog_url,source_modified_max,downloaded_at,schema_version,importer_version,license,integrity_status,status,provenance_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const common = ["MV SR","RAGEO","catalog","2026-09-25","2026-09-26","1","1","CC BY 4.0"];
  insert.run("r1", ...common, "PASS", "ACTIVE", '{"license":"CC BY 4.0"}', "2026-09-26");
  insert.run("r2", ...common, "FAILED", "CANDIDATE", '{"license":"CC BY 4.0"}', "2026-09-26");
  db.prepare("UPDATE address_reference_runtime SET active_release_id='r1',updated_at='x' WHERE singleton_id=1").run();
  assert.throws(
    () => db.prepare("UPDATE address_reference_runtime SET active_release_id='r2',previous_good_release_id='r1',updated_at='y' WHERE singleton_id=1").run(),
    /integrity must be PASS/,
  );
  assert.equal(db.prepare("SELECT active_release_id FROM address_reference_runtime WHERE singleton_id=1").get().active_release_id, "r1");
  db.close();
});

test("successful activation atomically marks previous-good and preserves attribution provenance", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const insert = db.prepare(`INSERT INTO address_dataset_releases
    (id,provider,dataset,catalog_url,source_modified_max,downloaded_at,schema_version,importer_version,license,integrity_status,status,provenance_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const common = ["Ministerstvo vnútra SR","Register adries / RAGEO","catalog","2026-09-25","2026-09-26","1","1","CC BY 4.0"];
  insert.run("r1", ...common, "PASS", "ACTIVE", '{"attribution":"MV SR"}', "2026-09-26");
  insert.run("r2", ...common, "PASS", "CANDIDATE", '{"attribution":"MV SR"}', "2026-09-26");
  db.prepare("UPDATE address_reference_runtime SET active_release_id='r1',updated_at='x' WHERE singleton_id=1").run();
  db.prepare("UPDATE address_reference_runtime SET previous_good_release_id='r1',active_release_id='r2',updated_at='y' WHERE singleton_id=1").run();
  assert.deepEqual(
    db.prepare("SELECT active_release_id,previous_good_release_id FROM address_reference_runtime WHERE singleton_id=1").get(),
    { active_release_id: "r2", previous_good_release_id: "r1" },
  );
  assert.equal(db.prepare("SELECT status FROM address_dataset_releases WHERE id='r1'").get().status, "PREVIOUS_GOOD");
  assert.equal(db.prepare("SELECT status FROM address_dataset_releases WHERE id='r2'").get().status, "ACTIVE");
  assert.match(db.prepare("SELECT provenance_json FROM address_dataset_releases WHERE id='r2'").get().provenance_json, /attribution/);
  db.close();
});
