import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { homepageDirectoryGroupedSql } from "../lib/homepage-directory-query.ts";
import { HOMEPAGE_REAL_IMAGE_SQL } from "../lib/homepage-media.ts";

// Reference query from before step 5. Keep parity under multiple rotations.
function legacySql(categoryCount) {
  const placeholders = Array(categoryCount).fill("?").join(", ");
  return `WITH candidates AS (
    SELECT id, slug, name, category, city, district, image_url, thumbnail_display_json,
      featured,
      CASE WHEN json_valid(source_data_json)
        AND json_type(source_data_json, '$."Okres"') IN ('text', 'integer', 'real')
        THEN CAST(json_extract(source_data_json, '$."Okres"') AS TEXT)
        ELSE NULL END AS fallback_district,
      ROW_NUMBER() OVER (PARTITION BY category, featured ORDER BY name ASC, id ASC) - 1 AS rotation_index,
      COUNT(*) OVER (PARTITION BY category, featured) AS rotation_count
    FROM directory_profiles
    WHERE status = 'published' AND category IN (${placeholders}) AND ${HOMEPAGE_REAL_IMAGE_SQL}
  ), ranked AS (
    SELECT id, slug, name, category, city, district, image_url, thumbnail_display_json,
      fallback_district,
      ROW_NUMBER() OVER (
        PARTITION BY category
        ORDER BY featured DESC,
          ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
      ) AS card_rank
    FROM candidates
  )
  SELECT id, slug, name, category, city, district, image_url,
    thumbnail_display_json, fallback_district
  FROM ranked
  WHERE card_rank <= ?
  ORDER BY category ASC, card_rank ASC`;
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, city TEXT,
    district TEXT, image_url TEXT, image_key TEXT, thumbnail_display_json TEXT,
    featured INTEGER, status TEXT, source_data_json TEXT
  )`);
  const insert = db.prepare(`INSERT INTO directory_profiles
    (id, slug, name, category, city, district, image_url, image_key,
     thumbnail_display_json, featured, status, source_data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let id = 0;
  for (const category of ["veterinari", "treneri", "salony", "ine"]) {
    for (let index = 0; index < 35; index++) {
      id++;
      const key = index % 12 === 0 ? "safe/not-public.webp" : `directory/${category}/${index}.webp`;
      const image = index % 11 === 0 ? "/images/fallback.webp" : `/media/${key}`;
      const status = index % 13 === 0 ? "draft" : "published";
      const data = index % 8 === 0 ? "invalid json"
        : index % 7 === 0 ? '{"Okres":["invalid"]}'
        : index % 6 === 0 ? '{"Okres":17}'
        : index % 5 === 0 ? '{"Okres":"Nitra"}'
        : null;
      insert.run(
        id, `profile-${id}`, "Zariadenie " + String(index % 10).padStart(2, "0"),
        category, "Mesto", index % 3 ? "" : "Okres", image, key,
        JSON.stringify({ mode: "crop", x: index }), index % 5 === 0 ? 1 : 0,
        status, data,
      );
    }
  }
  return db;
}

test("optimized homepage directory query matches legacy profiles, order, rotations and JSON fallback", () => {
  const db = fixture();
  try {
    for (const categories of [["veterinari", "treneri"], ["treneri"], ["salony", "ine"]]) {
      const original = db.prepare(legacySql(categories.length));
      const optimized = db.prepare(homepageDirectoryGroupedSql(categories.length));
      for (const offset of [0, 1, 8, 16, 144]) {
        for (const limit of [1, 3, 8, 12]) {
          const bindings = [...categories, offset, limit];
          assert.deepEqual(optimized.all(...bindings), original.all(...bindings),
            `Mismatch categories=${categories.join(",")} offset=${offset} limit=${limit}`);
        }
      }
    }
  } finally {
    db.close();
  }
});

test("window ranking uses only lightweight columns; public eligibility and LIMIT are unchanged", () => {
  const sql = homepageDirectoryGroupedSql(2);
  const candidates = sql.slice(sql.indexOf("WITH candidates"), sql.indexOf("), ranked AS"));
  const ranking = sql.slice(sql.indexOf("ranked AS"), sql.indexOf("), selected AS"));
  const selection = sql.slice(sql.indexOf("selected AS"), sql.indexOf("FROM selected"));
  assert.match(candidates, /status = 'published'/);
  assert.match(candidates, /image_key IS NOT NULL/);
  assert.match(candidates, /PARTITION BY category, featured/);
  for (const source of [candidates, ranking])
    assert.doesNotMatch(source, /source_data_json|thumbnail_display_json/);
  assert.match(selection, /WHERE card_rank <= \?/);
  assert.match(sql, /INNER JOIN directory_profiles AS profile ON profile\.id = selected\.id/);
  assert.ok(sql.indexOf("json_valid(profile.source_data_json)") > sql.indexOf("selected AS"));
  assert.throws(() => homepageDirectoryGroupedSql(0), RangeError);
  assert.throws(() => homepageDirectoryGroupedSql(13), RangeError);
});
