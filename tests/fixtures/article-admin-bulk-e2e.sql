DELETE FROM managed_articles WHERE id BETWEEN 970001 AND 970003 OR id BETWEEN 971001 AND 971051;

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author, intro, takeaway,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES
  (970001, 'admin-2e-e2e-draft-a', 'ADMIN-2E Draft A', 'Isolated E2E draft article.', 'Výcvik', 'clanky', 'draft', 'forest', 'Redakcia Psipedia', 'Intro', 'Takeaway', '2098-01-03T10:00:00.000Z', '2098-01-03T10:00:00.000Z', NULL, 'e2e@psipedia.local', 'e2e@psipedia.local'),
  (970002, 'admin-2e-e2e-scheduled-b', 'ADMIN-2E Scheduled B', 'Isolated E2E scheduled article.', 'Zdravie', 'clanky', 'scheduled', 'coral', 'Redakcia Psipedia', 'Intro', 'Takeaway', '2098-01-02T10:00:00.000Z', '2098-01-02T10:00:00.000Z', '2098-12-01T08:00:00.000Z', 'e2e@psipedia.local', 'e2e@psipedia.local'),
  (970003, 'admin-2e-e2e-published-c', 'ADMIN-2E Published C', 'Isolated E2E published article.', 'Výživa', 'clanky', 'published', 'gold', 'Redakcia Psipedia', 'Intro', 'Takeaway', '2098-01-01T10:00:00.000Z', '2098-01-01T10:00:00.000Z', '2098-01-01T08:00:00.000Z', 'e2e@psipedia.local', 'e2e@psipedia.local');

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 51
)
INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author, intro, takeaway,
  created_at, updated_at, published_at, created_by, updated_by
)
SELECT
  971000 + n,
  printf('admin-2e-e2e-page-%03d', n),
  printf('ADMIN-2E Page %03d', n),
  'Isolated pagination fixture.',
  'Život so psom',
  'clanky',
  'draft',
  'forest',
  'Redakcia Psipedia',
  'Intro',
  'Takeaway',
  printf('2097-12-%02dT09:00:00.000Z', ((n - 1) % 28) + 1),
  printf('2097-12-%02dT09:%02d:00.000Z', ((n - 1) % 28) + 1, n % 60),
  NULL,
  'e2e@psipedia.local',
  'e2e@psipedia.local'
FROM seq;
