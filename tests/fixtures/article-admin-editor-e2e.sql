DELETE FROM managed_articles WHERE id IN (972001, 972002);

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  972001,
  'article-admin-legacy-fixture',
  'ARTICLE-ADMIN legacy fixture',
  'Izolovaný testovací článok pre overenie spätnej kompatibility editora.',
  'Život so psom',
  'clanky',
  'draft',
  'forest',
  'Legacy autor',
  'Legacy úvod článku, ktorý zostáva editovateľný bez canonical JSON.',
  '',
  '[{"heading":"Legacy sekcia","paragraphs":["Repo-managed testovací obsah bez produkčných dát."],"bullets":[]}]',
  '[]',
  '[]',
  4,
  '2026-09-18T10:00:00.000Z',
  '2026-09-18T10:00:00.000Z',
  NULL,
  'ci:article-admin',
  'ci:article-admin'
);


INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  972002,
  'article-admin-legacy-fixture-mobile',
  'ARTICLE-ADMIN legacy fixture mobile',
  'Izolovaný mobilný testovací článok pre overenie spätnej kompatibility editora.',
  'Život so psom',
  'clanky',
  'draft',
  'forest',
  'Legacy autor',
  'Legacy úvod článku, ktorý zostáva editovateľný bez canonical JSON.',
  '',
  '[{"heading":"Legacy sekcia","paragraphs":["Repo-managed mobilný testovací obsah bez produkčných dát."],"bullets":[]}]',
  '[]',
  '[]',
  4,
  '2026-09-18T10:00:00.000Z',
  '2026-09-18T10:00:00.000Z',
  NULL,
  'ci:article-admin',
  'ci:article-admin'
);
