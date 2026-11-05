import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { homepageDirectoryGroupedSql } from "../lib/homepage-directory-query.ts";
import { HOMEPAGE_REAL_IMAGE_SQL } from "../lib/homepage-media.ts";
import { homepageRotationOffset } from "../lib/homepage-rotation.ts";

// Copy of the original single-category D1 selection to ensure the grouped
// optimization never changes visible homepage ordering or eligibility.
const originalSql = `WITH candidates AS (
  SELECT id, slug, name, category, city, district, image_url, thumbnail_display_json,
    featured,
    CASE WHEN json_valid(source_data_json)
      AND json_type(source_data_json, '$."Okres"') IN ('text', 'integer', 'real')
      THEN CAST(json_extract(source_data_json, '$."Okres"') AS TEXT)
      ELSE NULL END AS fallback_district,
    ROW_NUMBER() OVER (PARTITION BY featured ORDER BY name ASC, id ASC) - 1 AS rotation_index,
    COUNT(*) OVER (PARTITION BY featured) AS rotation_count
  FROM directory_profiles
  WHERE status = 'published' AND category = ? AND ${HOMEPAGE_REAL_IMAGE_SQL}
)
SELECT id, slug, name, category, city, district, image_url, thumbnail_display_json,
  fallback_district
FROM candidates
ORDER BY featured DESC,
  ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
LIMIT ?`;

test("one homepage D1 query matches two separate category queries across daily rotation", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, city TEXT NOT NULL, district TEXT NOT NULL,
      image_url TEXT, image_key TEXT, thumbnail_display_json TEXT,
      featured INTEGER NOT NULL, status TEXT NOT NULL, source_data_json TEXT
    )`);
    const insert = db.prepare(`INSERT INTO directory_profiles
      (id, slug, name, category, city, district, image_url, image_key,
        thumbnail_display_json, featured, status, source_data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let id = 0;
    for (const category of ["veterinari", "treneri"]) {
      for (let index = 0; index < 26; index++) {
        id++;
        const imageKey = category + "/" + id + ".webp";
        insert.run(
          id, category + "-" + index, "Profil " + String(index).padStart(2, "0"),
          category, "Nitra", "", index === 24 ? null : "/media/" + imageKey,
          index === 24 ? null : imageKey, null,
          index < 3 ? 1 : 0, index === 25 ? "draft" : "published",
          JSON.stringify({ Okres: "Nitra" }),
        );
      }
    }

    const single = db.prepare(originalSql);
    const grouped = db.prepare(homepageDirectoryGroupedSql(2));
    for (const date of ["2026-11-04", "2026-11-05", "2026-11-13"]) {
      const offset = homepageRotationOffset(date, 8);
      const both = grouped.all("veterinari", "treneri", offset, 8);
      assert.equal(both.length, 16);
      for (const category of ["veterinari", "treneri"]) {
        const expected = single.all(category, offset, 8);
        const actual = both.filter(row => row.category === category);
        assert.deepEqual(actual, expected, `${category} should preserve the original order on ${date}`);
        assert.equal(new Set(actual.map(row => row.id)).size, 8);
        assert.ok(actual.slice(0, 3).every(row => row.id % 26 >= 1 && row.id % 26 <= 3));
      }
    }

    const noMatching = db.prepare(homepageDirectoryGroupedSql(1)).all("salony-a-sluzby", 0, 8);
    assert.deepEqual(noMatching, []);
  } finally {
    db.close();
  }
});

test("grouped homepage query only interpolates bounded placeholder counts", () => {
  assert.throws(() => homepageDirectoryGroupedSql(0), RangeError);
  assert.throws(() => homepageDirectoryGroupedSql(13), RangeError);
  assert.throws(() => homepageDirectoryGroupedSql(1.5), RangeError);
  assert.equal(homepageDirectoryGroupedSql(2).match(/\?/g)?.length, 4);
  assert.match(homepageDirectoryGroupedSql(2), /PARTITION BY category, featured/);
  assert.match(homepageDirectoryGroupedSql(2), /WHERE status = 'published'/);
});
