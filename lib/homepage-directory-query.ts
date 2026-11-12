import { HOMEPAGE_REAL_IMAGE_SQL } from "./homepage-media.ts";

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
    -- Window functions need only the ordering keys, never full profile payloads.
    SELECT id, name, category, featured,
      ROW_NUMBER() OVER (PARTITION BY category, featured ORDER BY name ASC, id ASC) - 1 AS rotation_index,
      COUNT(*) OVER (PARTITION BY category, featured) AS rotation_count
    FROM directory_profiles
    WHERE status = 'published' AND category IN (${placeholders}) AND ${HOMEPAGE_REAL_IMAGE_SQL}
  ), ranked AS (
    SELECT id, category,
      ROW_NUMBER() OVER (
        PARTITION BY category
        ORDER BY featured DESC,
          ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
      ) AS card_rank
    FROM candidates
  ), selected AS (
    SELECT id, category, card_rank FROM ranked WHERE card_rank <= ?
  )
  -- Resolve display columns and potentially expensive legacy JSON only after
  -- ranking/limiting. One D1 roundtrip, identical featured-first daily ordering.
  SELECT selected.id, profile.slug, profile.name, selected.category,
    profile.city, profile.district, profile.image_url,
    profile.thumbnail_display_json,
    CASE WHEN json_valid(profile.source_data_json)
      AND json_type(profile.source_data_json, '$."Okres"') IN ('text', 'integer', 'real')
      THEN CAST(json_extract(profile.source_data_json, '$."Okres"') AS TEXT)
      ELSE NULL END AS fallback_district
  FROM selected
  INNER JOIN directory_profiles AS profile ON profile.id = selected.id
  ORDER BY selected.category ASC, selected.card_rank ASC`;
}
