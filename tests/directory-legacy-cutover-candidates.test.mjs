import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { buildDirectoryLegacyCutoverCandidatesSql } from "../scripts/directory-legacy-cutover-candidates.mjs";

test("candidate queue is only SELECT, with bounded IDs and no public/private values", () => {
  const sql = buildDirectoryLegacyCutoverCandidatesSql();
  assert.match(sql, /^SELECT psipedia_id, category, status, field, canonical_key, issue/);
  assert.match(sql, /ORDER BY priority, category, psipedia_id, field, issue LIMIT 500/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE)\b/i);
  assert.doesNotMatch(sql, /SELECT\s+\*|AS\s+(?:email|phone|website|name|source_data_json)\b/i);
});

test("review queue distinguishes legacy-only, explicit clears and actual conflicts", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, status TEXT, district TEXT, source_data_json TEXT)");
    const insert = db.prepare("INSERT INTO directory_profiles (id, category, status, district, source_data_json) VALUES (?,?,?,?,?)");
    insert.run(1, "kynologicke-kluby", "published", "", JSON.stringify({
      Okres: "Nitra", "Zastrešujúca organizácia": "ZŠK SR",
      "Otváracie hodiny": "Po-Pi", "Oblasť pôsobenia": "Západ",
      "_psipedia_additional_categories": ["treneri"], "E-mail": "private@example.sk",
    }));
    insert.run(2, "chovatelske-stanice", "published", "Levice", JSON.stringify({
      Okres: "Nitra", Organizácia: "", "Zastrešujúca organizácia": "Historická",
      Plemeno: "Labrador", Plemená: "Papillon", "FCI skupina": "8", FCI: "9",
      "Ordinačné hodiny": "", "Otváracia doba": "Pôvodný harmonogram",
    }));
    insert.run(3, "vencenie", "draft", "", "{invalid-json");
    insert.run(4, "veterinari", "published", "Nitra", JSON.stringify({
      Okres: "Nitra", Organizácia: "ZŠK SR", "Zastrešujúca organizácia": "ZŠK SR",
      "Ordinačné hodiny": "08:00", "Otváracie hodiny": "08:00",
    }));
    const rows = db.prepare(buildDirectoryLegacyCutoverCandidatesSql()).all();
    const set = new Set(rows.map(row => [row.psipedia_id, row.field, row.issue].join(":")));
    for (const expected of [
      "1:district:legacy_only", "1:organization:legacy_only", "1:hours:legacy_only",
      "1:coverage:legacy_only", "2:district:conflict",
      "2:organization:explicit_clear_with_legacy", "2:breed:conflict",
      "2:fci_group:conflict", "2:hours:explicit_clear_with_legacy",
      "3:invalid_json:invalid_json",
    ]) assert.ok(set.has(expected), expected);
    assert.equal(rows.some(row => row.psipedia_id === 4), false, "equal canonical/legacy records are not candidates");
    assert.ok(rows.every(row => Object.keys(row).sort().join(",") ===
      "canonical_key,category,field,issue,psipedia_id,status"));
    assert.doesNotMatch(JSON.stringify(rows), /private@example.sk|Historická|Papillon|Západ|ZŠK SR/);
    assert.ok(rows.every(row => Number.isInteger(row.psipedia_id)));
  } finally {
    db.close();
  }
});
