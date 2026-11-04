import { HOMEPAGE_REAL_IMAGE_SQL } from "./homepage-media";

/**
 * Load multiple homepage directory categories in one D1 roundtrip, retaining
 * each category's independent featured-first, day-rotated ordering.
 *
 * Values are always bound parameters; the only interpolated part is a bounded
 * number of SQLite placeholders.
 */
export function homepageDirectoryGroupedSql(categoryCount: number): string {
  if (!Number.isInteger(categoryCount) || categoryCount < 1 || categoryCount > 12) {
    throw new RangeError("Homepage directory category count must be between 1 and 12");
  }
  const placeholders = Array.from({ length: categoryCount }, () => "?").join(", ");
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
