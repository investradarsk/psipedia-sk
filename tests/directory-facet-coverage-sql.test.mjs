import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { directoryFilterRegistry } from "../lib/directory-filter-contract.ts";
import { buildFacetCoverageSql } from "../scripts/directory-facet-coverage-sql.mjs";

test("approved 21-facet SQL is an aggregate-only SELECT", () => {
  const sql = buildFacetCoverageSql();
  assert.match(sql, /^WITH definitions\(/);
  assert.equal((sql.match(/\),\n    \('/g) || []).length + 1, 21);
  assert.equal(sql.match(/;/g)?.length, 1);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA)\b/i);
  for (const d of directoryFilterRegistry) assert.ok(sql.includes(d.d1.key));
});

test("SQL counts only published, explicit values and emits no private fields", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE directory_profiles (category TEXT, status TEXT, source_data_json TEXT)");
    const ins = db.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?)");
    const k = "_psipedia_filter_v1_veterinari_emergency";
    ins.run("veterinari", "published", JSON.stringify({ [k]: "yes", "E-mail": "secret@example.invalid" }));
    ins.run("veterinari", "published", JSON.stringify({ [k]: "no" }));
    ins.run("veterinari", "published", JSON.stringify({ [k]: "unknown" }));
    ins.run("veterinari", "published", "{}");
    ins.run("veterinari", "published", "{broken");
    ins.run("veterinari", "published", JSON.stringify({ [k]: "invalid" }));
    ins.run("veterinari", "published", JSON.stringify({ [k]: "" }));
    ins.run("veterinari", "published", "[]");
    ins.run("veterinari", "published", JSON.stringify({ [k]: true }));
    ins.run("veterinari", "published", JSON.stringify({ [k]: "yes" }));
    ins.run("veterinari", "draft", JSON.stringify({ [k]: "yes" }));
    const rows = db.prepare(buildFacetCoverageSql()).all();
    assert.equal(rows.length, 21);
    const v = rows.find((x) => x.facet === "veterinari.emergency");
    assert.deepEqual([
      Number(v.published_profiles), Number(v.confirmed_values),
      Number(v.explicit_unknown), Number(v.missing_values),
      Number(v.malformed_json), Number(v.invalid_values),
    ], [10, 3, 1, 2, 2, 2]);
    assert.equal(Number(v.confirmed_yes), 2);
    assert.equal(Number(v.confirmed_no), 1);
    assert.equal(Number(v.confirmed_ambulance), 0);
    assert.equal(Number(v.published_profiles), ["confirmed_values", "explicit_unknown", "missing_values", "malformed_json", "invalid_values"].reduce((n, key) => n + Number(v[key]), 0));
    assert.equal(Number(rows.find((x) => x.facet === "vencenie.group_walks").published_profiles), 0);
    assert.ok(!JSON.stringify(rows).includes("secret@example.invalid"));
  } finally { db.close(); }
});
