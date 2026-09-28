DELETE FROM managed_articles WHERE id BETWEEN 973001 AND 973061;

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 61
)
INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author, intro, takeaway,
  created_at, updated_at, published_at, created_by, updated_by
)
SELECT
  973000 + n,
  printf('admin-search-e2e-%03d', n),
  CASE WHEN n = 61 THEN 'Žlté zúbky ADMIN SEARCH cieľ'
       ELSE printf('ADMIN SEARCH Page %03d', n) END,
  CASE WHEN n = 61 THEN 'Cieľ s diakritikou, ktorý musí server nájsť mimo prvej strany.'
       ELSE 'Izolovaná server-side pagination fixture.' END,
  'Zdravie',
  'clanky',
  'draft',
  'forest',
  'Redakcia Psipedia',
  'Intro',
  'Takeaway',
  CASE WHEN n = 61 THEN '2098-12-31T10:00:00.000Z' ELSE printf('2099-01-01T10:00:%02d.000Z', 60 - n) END,
  CASE WHEN n = 61 THEN '2098-12-31T10:00:00.000Z' ELSE printf('2099-01-01T10:00:%02d.000Z', 60 - n) END,
  NULL,
  'ci:admin-search',
  'ci:admin-search'
FROM seq;
