import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildDirectoryLegacyCutoverReadinessSql } from "../scripts/directory-legacy-cutover-readiness.mjs";

test("cutover readiness SQL is a strictly aggregate read-only SELECT", () => {
  const sql = buildDirectoryLegacyCutoverReadinessSql();
  assert.match(sql, /^SELECT\n/);
  assert.match(sql, /GROUP BY category, status/);
  assert.match(sql, /ORDER BY category, status;/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE)\b/i);
  assert.doesNotMatch(sql, /SELECT\s+\*|AS\s+(?:phone|email|address|source_data_json|name)\b/i);
  assert.match(sql, /profiles_with_technical_json_dependencies/);
  assert.match(sql, /organization_conflict_or_cleared/);
  assert.match(sql, /district_legacy_only/);
});

test("cutover report separates legacy dependencies, conflicts, clears and invalid JSON", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT, status TEXT,
      district TEXT, source_data_json TEXT
    )`);
    const ins = db.prepare(
      "INSERT INTO directory_profiles (id,category,status,district,source_data_json) VALUES (?,?,?,?,?)",
    );
    ins.run(1, "kynologicke-kluby", "published", "Nitra", JSON.stringify({
      Okres: "Levice", Organizácia: "Nová organizácia",
      "Zastrešujúca organizácia": "Stará organizácia",
      Plemeno: "Pudel", Plemená: "Labrador", "FCI skupina": "9", FCI: "8",
      "_psipedia_additional_categories": ["treneri"],
      "E-mail": "private@example.sk",
    }));
    ins.run(2, "kynologicke-kluby", "published", "", JSON.stringify({
      Okres: "Nitra", "Zastrešujúca organizácia": "Len historická",
      Plemená: "Labrador", FCI: "8",
      "Otváracie hodiny": "Po–Pi", "Oblasť pôsobenia": "Nitra",
    }));
    ins.run(3, "kynologicke-kluby", "published", "", JSON.stringify({
      Organizácia: "", "Zastrešujúca organizácia": "Odstránený klub",
      Plemeno: "", Plemená: "Odstránené plemeno",
      "FCI skupina": "", FCI: "Odstránená skupina",
      "Ordinačné hodiny": "", "Otváracie hodiny": "Staré hodiny",
      Pokrytie: "", "Oblasť pôsobenia": "Staré pokrytie",
    }));
    ins.run(4, "kynologicke-kluby", "published", "", "{invalid-json");
    ins.run(5, "treneri", "draft", "Nitra", "{}");
    const rows = db.prepare(buildDirectoryLegacyCutoverReadinessSql()).all();
    assert.equal(rows.length, 2);
    const club = rows.find(row => row.category === "kynologicke-kluby");
    assert.ok(club);
    assert.equal(club.total_profiles, 4);
    assert.equal(club.invalid_json, 1);
    assert.equal(club.district_legacy_only, 1);
    assert.equal(club.district_conflict, 1);
    assert.equal(club.organization_legacy_only, 1);
    assert.equal(club.organization_conflict_or_cleared, 2);
    assert.equal(club.breed_legacy_only, 1);
    assert.equal(club.breed_conflict_or_cleared, 2);
    assert.equal(club.fci_legacy_only, 1);
    assert.equal(club.fci_conflict_or_cleared, 2);
    assert.equal(club.hours_legacy_only, 1);
    assert.equal(club.coverage_legacy_only, 1);
    assert.equal(club.profiles_with_technical_json_dependencies, 1);
    assert.equal(rows.find(row => row.category === "treneri").total_profiles, 1);
    const serialized = JSON.stringify(rows);
    assert.doesNotMatch(serialized, /private@example\.sk|Nová organizácia|Labrador/);
  } finally {
    db.close();
  }
});
