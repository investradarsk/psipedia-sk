import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { directoryProfileCategoryLabels } from "../lib/directory.ts";
import {
  DIRECTORY_ADDITIONAL_CATEGORIES_KEY,
  directoryAdditionalCategoryJsonSql,
  directoryCategoryMembershipSql,
  readAdditionalDirectoryCategories,
} from "../lib/directory-multi-category.ts";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("compact directory cards retain only category membership metadata", () => {
  const store = source("lib/directory-store.ts");
  const start = store.indexOf("const DIRECTORY_CARD_COLUMNS = `");
  const end = store.indexOf("`;", start);
  assert.ok(start >= 0 && end > start);
  const cardColumns = store.slice(start, end);
  // json_group_array has SQLite's JSON subtype; force TEXT in json_object
  // so readAdditionalDirectoryCategories can parse the relational array.
  const projectedSqlPattern = /json_object\('_psipedia_additional_categories',\s*\(\$\{directoryAdditionalCategoryJsonSql\(\)\}\) \|\| ''\) AS source_data_json/;
  assert.match(cardColumns, projectedSqlPattern);
  const detailStart = store.indexOf("const DIRECTORY_PROFILE_COLUMNS = `");
  const detailEnd = store.indexOf("`;", detailStart);
  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  assert.match(store.slice(detailStart, detailEnd), projectedSqlPattern);
  assert.doesNotMatch(cardColumns, /'\{\}' AS source_data_json/);

  // The lightweight projection synthesizes a JSON-shaped response from SQL relations only.
  const expression = cardColumns
    .slice(cardColumns.indexOf("json_object("), cardColumns.indexOf(" AS source_data_json") + " AS source_data_json".length)
    .replace("${directoryAdditionalCategoryJsonSql()}", directoryAdditionalCategoryJsonSql());

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      -- Physical legacy JSON was removed: membership is owned by SQL.
      CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, status TEXT);
      CREATE TABLE directory_profile_additional_categories (
        profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
        category TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
        PRIMARY KEY (profile_id, category)
      );
    `);
    const insert = db.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?)");
    insert.run(1, "vencenie", "published");
    insert.run(2, "vencenie", "published");
    insert.run(3, "vencenie", "published");
    insert.run(4, "vencenie", "draft");
    const additional = db.prepare(
      "INSERT INTO directory_profile_additional_categories VALUES (?, ?, ?, ?)"
    );
    additional.run(1, "veterinari", "2026-11-21T00:00:00Z", "test");
    additional.run(4, "veterinari", "2026-11-21T00:00:00Z", "test");

    const rows = db.prepare(`SELECT id, category, ${expression}
      FROM directory_profiles WHERE status = 'published'
      AND ${directoryCategoryMembershipSql()} ORDER BY id`).all("veterinari", "veterinari");
    assert.deepEqual(rows.map((row) => row.id), [1]);
    const projected = JSON.parse(rows[0].source_data_json);
    assert.deepEqual(Object.keys(projected), [DIRECTORY_ADDITIONAL_CATEGORIES_KEY]);
    assert.equal(typeof projected[DIRECTORY_ADDITIONAL_CATEGORIES_KEY], "string");
    assert.deepEqual(JSON.parse(projected[DIRECTORY_ADDITIONAL_CATEGORIES_KEY]), ["veterinari"]);
    assert.equal(rows[0].source_data_json.includes("private@example.invalid"), false);
    assert.deepEqual(readAdditionalDirectoryCategories(projected, rows[0].category), ["veterinari"]);

    for (const id of [2, 3]) {
      const raw = db.prepare(`SELECT ${expression} FROM directory_profiles WHERE id = ?`).get(id);
      assert.deepEqual(readAdditionalDirectoryCategories(JSON.parse(raw.source_data_json), "vencenie"), []);
    }
  } finally {
    db.close();
  }
});

test("public cards and detail consistently show main and additional categories", () => {
  assert.deepEqual(directoryProfileCategoryLabels({
    category: "vencenie", additionalCategories: ["veterinari", "veterinari", "vencenie"],
  }), ["Venčenie psov", "Veterinárne pracovisko"]);
  assert.deepEqual(directoryProfileCategoryLabels({ category: "vencenie" }), ["Venčenie psov"]);
  assert.match(source("components/directory-card.tsx"), /typeLabel=\{categoryLabels\.join\(" · "\)\}/);
  assert.match(source("components/directory-profile-detail.tsx"), /categoryLabels\.map\(\(label\) =>/);
  assert.match(source("lib/directory-detail-presentation.ts"), /additionalCategories: profile\.additionalCategories \?\? \[\]/);
  // A secondary category is a listing membership, never an alternate detail URL.
  assert.match(source("components/directory-card.tsx"), /href=\{directoryProfileHref\(profile\)\}/);
});
