import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  DIRECTORY_ADDITIONAL_CATEGORIES_KEY,
  normalizeAdditionalDirectoryCategories,
  readAdditionalDirectoryCategories,
  mergeAdditionalDirectoryCategories,
  directoryCategoryMembershipSql,
  directoryAdditionalCategoryJsonSql,
} from "../lib/directory-multi-category.ts";

test("additional categories are validated, deduplicated, and exclude the primary", () => {
  assert.deepEqual(normalizeAdditionalDirectoryCategories(
    ["treneri", "hotely-a-opatrovanie", "treneri", "bogus"], "treneri",
  ), ["hotely-a-opatrovanie"]);
  assert.throws(() => mergeAdditionalDirectoryCategories({}, ["bogus"], "treneri"));
  assert.throws(() => mergeAdditionalDirectoryCategories({}, "hotely-a-opatrovanie", "treneri"));
});

test("untouched saves preserve categories and explicit clearing works", () => {
  const source = { [DIRECTORY_ADDITIONAL_CATEGORIES_KEY]: JSON.stringify(["hotely-a-opatrovanie"]) };
  assert.deepEqual(readAdditionalDirectoryCategories(
    mergeAdditionalDirectoryCategories({ ...source }, undefined, "treneri"), "treneri",
  ), ["hotely-a-opatrovanie"]);
  assert.deepEqual(readAdditionalDirectoryCategories(
    mergeAdditionalDirectoryCategories({ ...source }, [], "treneri"), "treneri",
  ), []);
});

test("secondary listing membership is parameterized", () => {
  assert.match(directoryCategoryMembershipSql(), /category = \?/);
  assert.match(directoryCategoryMembershipSql(), /json_each/);
  assert.throws(() => directoryCategoryMembershipSql("foo;drop"));
});

test("one canonical profile appears in both category listings exactly once", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT NOT NULL,
      status TEXT NOT NULL, source_data_json TEXT NOT NULL
    )`);
    const insert = db.prepare(
      "INSERT INTO directory_profiles (id, category, status, source_data_json) VALUES (?, ?, ?, ?)",
    );
    const source = (additional) => JSON.stringify({
      [DIRECTORY_ADDITIONAL_CATEGORIES_KEY]: JSON.stringify(additional),
    });
    insert.run(1, "treneri", "published", source(["hotely-a-opatrovanie", "treneri"]));
    insert.run(2, "hotely-a-opatrovanie", "published", "{}");
    insert.run(3, "treneri", "published", "{}");
    insert.run(4, "treneri", "draft", source(["hotely-a-opatrovanie"]));
    insert.run(5, "treneri", "published", "not valid JSON");

    const sql = `SELECT id FROM directory_profiles
      WHERE status='published' AND ${directoryCategoryMembershipSql()}
      ORDER BY id`;
    const query = db.prepare(sql);
    assert.deepEqual(query.all("hotely-a-opatrovanie", "hotely-a-opatrovanie").map((row) => row.id), [1, 2]);
    assert.deepEqual(query.all("treneri", "treneri").map((row) => row.id), [1, 3, 5]);
    assert.deepEqual(query.all("kynologicke-kluby", "kynologicke-kluby"), []);
    assert.match(directoryAdditionalCategoryJsonSql("directory_profiles"), /json_valid/);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM directory_profiles
      WHERE status='published'`).get().count, 4);
  } finally {
    db.close();
  }
});
