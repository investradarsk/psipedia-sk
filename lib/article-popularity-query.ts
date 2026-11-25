/** One aggregate over the seven-day window, exact independent top-N rankings. */
export const popularArticlesBothWindowsSql = `
  WITH totals AS (
    SELECT a.id, a.slug, a.title, a.category, a.portal_section, a.portal_subpage,
      a.news_category, a.image_url, COALESCE(a.published_at, a.updated_at) AS published_at,
      a.updated_at,
      SUM(CASE WHEN h.bucket_hour >= ?2 THEN h.qualified_reads END) AS reads24h,
      SUM(h.qualified_reads) AS reads7d
    FROM article_read_hourly h
    JOIN managed_articles a ON a.id = h.article_id
    WHERE h.bucket_hour >= ?1 AND h.bucket_hour <= ?3
      AND (a.status = 'published' OR (a.status = 'scheduled' AND a.published_at <= ?4))
      AND (?5 IS NULL OR a.slug <> ?5)
    GROUP BY a.id, a.slug, a.title, a.category, a.portal_section, a.portal_subpage,
      a.news_category, a.image_url, a.published_at, a.updated_at
  ), ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (ORDER BY reads24h DESC, published_at DESC, id DESC) AS rank24h,
      ROW_NUMBER() OVER (ORDER BY reads7d DESC, published_at DESC, id DESC) AS rank7d
    FROM totals
  )
  SELECT * FROM ranked
  WHERE (reads24h IS NOT NULL AND rank24h <= ?6) OR rank7d <= ?6
`;
