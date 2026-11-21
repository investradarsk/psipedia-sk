import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { homepageDirectoryGroupedSql } from "../lib/homepage-directory-query.ts";
import { HOMEPAGE_REAL_IMAGE_SQL } from "../lib/homepage-media.ts";
import { directoryImageSqlExpression } from "../lib/directory-presentation-sql-read.ts";

// SQL-only reference: keep parity of published profiles and daily rotations.
function referenceSql(categoryCount) {
  const placeholders = Array(categoryCount).fill("?").join(", ");
  return `WITH candidates AS (
    SELECT id, slug, name, category, city, district, image_url,
      featured,
      ROW_NUMBER() OVER (PARTITION BY category, featured ORDER BY name ASC, id ASC) - 1 AS rotation_index,
      COUNT(*) OVER (PARTITION BY category, featured) AS rotation_count
    FROM directory_profiles
    WHERE status = 'published' AND category IN (${placeholders}) AND ${HOMEPAGE_REAL_IMAGE_SQL}
  ), ranked AS (
    SELECT id, slug, name, category, city, district, image_url,
      ROW_NUMBER() OVER (
        PARTITION BY category
        ORDER BY featured DESC,
          ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
      ) AS card_rank
    FROM candidates
  )
  SELECT p.id, p.slug, p.name, p.category, p.city, p.district, p.image_url,
    ${directoryImageSqlExpression("thumbnail","p")} AS thumbnail_display_json,
    NULL AS fallback_district
  FROM ranked AS r
  JOIN directory_profiles AS p ON p.id=r.id
  WHERE r.card_rank <= ?
  ORDER BY p.category ASC, r.card_rank ASC`;
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, city TEXT,
    district TEXT, image_url TEXT, image_key TEXT,
    featured INTEGER, status TEXT
  );
  CREATE TABLE directory_profile_image_display_settings (
    profile_id INTEGER NOT NULL, display_context TEXT NOT NULL,
    display_mode TEXT NOT NULL, focus_x REAL NOT NULL, focus_y REAL NOT NULL,
    zoom REAL NOT NULL, PRIMARY KEY (profile_id, display_context)
  )`);
  const insert = db.prepare(`INSERT INTO directory_profiles
    (id, slug, name, category, city, district, image_url, image_key,
     featured, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDisplay = db.prepare(`INSERT INTO directory_profile_image_display_settings
    (profile_id,display_context,display_mode,focus_x,focus_y,zoom)
    VALUES (?,'thumbnail','crop',?,?,?)`);
  let id = 0;
  for (const category of ["veterinari", "treneri", "salony", "ine"]) {
    for (let index = 0; index < 35; index++) {
      id++;
      const key = index % 12 === 0 ? "safe/not-public.webp" : `directory/${category}/${index}.webp`;
      const image = index % 11 === 0 ? "/images/fallback.webp" : `/media/${key}`;
      const status = index % 13 === 0 ? "draft" : "published";
       insert.run(
        id, `profile-${id}`, "Zariadenie " + String(index % 10).padStart(2, "0"),
        category, "Mesto", index % 3 ? "" : "Okres", image, key,
        index % 5 === 0 ? 1 : 0, status,
      );
      if (index % 3 !== 0) insertDisplay.run(id, index % 101, 50, 1);
    }
  }
  return db;
}

test("optimized homepage directory query matches SQL-only reference profiles and daily rotations", () => {
  const db = fixture();
  try {
    for (const categories of [["veterinari", "treneri"], ["treneri"], ["salony", "ine"]]) {
      const original = db.prepare(referenceSql(categories.length));
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
  assert.ok(sql.indexOf("directory_profile_image_display_settings") > sql.indexOf("selected AS"));
  assert.doesNotMatch(sql, /source_data_json|json_valid/);
  assert.throws(() => homepageDirectoryGroupedSql(0), RangeError);
  assert.throws(() => homepageDirectoryGroupedSql(13), RangeError);
});
