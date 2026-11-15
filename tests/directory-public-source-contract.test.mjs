import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_PUBLIC_SOURCE_FACETS,
  directoryEffectiveDistrictSql,
  directoryEffectiveDistrictValue,
  directoryLegacyDistrictSql,
} from "../lib/directory-public-source-contract.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY,
    status TEXT,
    category TEXT,
    district TEXT,
    source_data_json TEXT
  )`);
  const insert = db.prepare(
    "INSERT INTO directory_profiles (id,status,category,district,source_data_json) VALUES (?,?,?,?,?)",
  );
  insert.run(1, "published", "kynologicke-kluby", "Nitra",
    JSON.stringify({
      Okres: "Levice", Organizácia: "Nový klub",
      "Zastrešujúca organizácia": "Starý klub", Plemeno: "Labrador",
      Plemená: "Pudel", "FCI skupina": "8", FCI: "9",
      "Typ služby": "Klub", "Typ klubu": "Starý klub",
    }));
  insert.run(2, "published", "kynologicke-kluby", "",
    JSON.stringify({
      Okres: "Nitra", "Zastrešujúca organizácia": "Len import",
      Plemená: "Zlatý retriever", FCI: "8", "Typ klubu": "Kynologický klub",
    }));
  insert.run(3, "published", "kynologicke-kluby", "",
    JSON.stringify({
      Okres: "Levice", Organizácia: "",
      "Zastrešujúca organizácia": "Nesmie sa obnoviť",
      Plemeno: "", Plemená: "Tiež nesmie ožiť",
      "FCI skupina": "", FCI: "9",
      "Typ služby": "", "Typ klubu": "Stará kategória",
    }));
  insert.run(4, "published", "kynologicke-kluby", "   ", "{broken json");
  insert.run(5, "published", "kynologicke-kluby", "   ",
    JSON.stringify({ Okres: "  ", Organizácia: null, "Zastrešujúca organizácia": "Starý klub" }));
  return db;
}

test("canonical organization, breeds, FCI and profile type override historical aliases", () => {
  const db = fixture();
  try {
    const fields = DIRECTORY_PUBLIC_SOURCE_FACETS;
    const rows = db.prepare(
      `SELECT id, ${directoryEffectiveDistrictSql()} AS district,
        ${fields.breed} AS breed,
        ${fields.fciGroup} AS fciGroup,
        ${fields.organization} AS organization,
        ${fields.profileType} AS profileType
       FROM directory_profiles ORDER BY id`,
    ).all();
    assert.equal(rows.length, 5);
    assert.deepEqual([
      rows[0].district, rows[0].breed, rows[0].fciGroup, rows[0].organization, rows[0].profileType,
    ], ["Nitra", "Labrador", "8", "Nový klub", "Klub"]);
    assert.deepEqual([
      rows[1].district, rows[1].breed, rows[1].fciGroup, rows[1].organization, rows[1].profileType,
    ], ["Nitra", "Zlatý retriever", "8", "Len import", "Kynologický klub"]);
    assert.deepEqual([
      rows[2].district, rows[2].breed, rows[2].fciGroup, rows[2].organization, rows[2].profileType,
    ], ["Levice", "", "", "", ""]);
    assert.deepEqual([
      rows[3].district, rows[3].breed, rows[3].fciGroup, rows[3].organization, rows[3].profileType,
    ], ["", "", "", "", ""]);
    assert.equal(rows[4].district, "");
    assert.equal(rows[4].organization, "");
  } finally {
    db.close();
  }
});

test("canonical district drives public filters, with fallback only for truly empty D1 columns", () => {
  const db = fixture();
  try {
    const districtSql = directoryEffectiveDistrictSql();
    assert.deepEqual(
      db.prepare(`SELECT id FROM directory_profiles WHERE ${districtSql} = ? ORDER BY id`)
        .all("Nitra").map(row => row.id),
      [1, 2],
    );
    assert.deepEqual(
      db.prepare(`SELECT id FROM directory_profiles WHERE ${districtSql} = ? ORDER BY id`)
        .all("Levice").map(row => row.id),
      [3],
    );
    assert.deepEqual(
      db.prepare(`SELECT id FROM directory_profiles WHERE ${districtSql} = ? ORDER BY id`)
        .all("").map(row => row.id),
      [4, 5],
    );
    const derived = db.prepare(`SELECT id, ${directoryLegacyDistrictSql("profile")} AS sourceDistrict
      FROM directory_profiles profile ORDER BY id`).all();
    assert.deepEqual(derived.map(r => r.sourceDistrict), ["Levice", "Nitra", "Levice", null, null]);
    assert.equal(directoryEffectiveDistrictValue(" Nitra ", "Levice"), "Nitra");
    assert.equal(directoryEffectiveDistrictValue("", " Nitra "), "Nitra");
    assert.equal(directoryEffectiveDistrictValue("   ", null), "");
  } finally {
    db.close();
  }
});

test("public listing, homepage and location option queries share one SQL district contract", () => {
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  const facets = readFileSync(new URL("../lib/directory-read-facets.ts", import.meta.url), "utf8");
  const homepage = readFileSync(new URL("../lib/homepage-directory-query.ts", import.meta.url), "utf8");
  assert.match(store, /const DIRECTORY_SOURCE_FACETS = DIRECTORY_PUBLIC_SOURCE_FACETS/);
  assert.match(store, /directoryEffectiveDistrictSql\(\) \+ " = \?"/);
  assert.match(store, /district: directoryEffectiveDistrictValue\(/);
  assert.match(store, /directoryLegacyDistrictSql\(\) AS fallback_district/);
  assert.match(facets, /const districtExpression = directoryEffectiveDistrictSql\(\)/);
  assert.match(homepage, /directoryLegacyDistrictSql\("profile"\)\} AS fallback_district/);
  assert.doesNotMatch(facets, /json_extract\(source_data_json, '\$\."Okres"'\)/);
  assert.doesNotMatch(homepage, /json_extract\(profile.source_data_json, '\$\."Okres"'\)/);
  assert.doesNotMatch(store, /json_extract\(source_data_json, '\$\."Okres"'\)/);
});
