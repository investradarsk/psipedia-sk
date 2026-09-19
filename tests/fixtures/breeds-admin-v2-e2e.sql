DELETE FROM breed_article_relations WHERE article_id = 973001;
DELETE FROM breed_directory_relations WHERE profile_id IN (973101, 973102);
DELETE FROM managed_articles WHERE id = 973001;
DELETE FROM directory_profiles WHERE id IN (973101, 973102);

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  973001,
  'breeds-admin-related-article',
  'BREEDS-ADMIN súvisiaci článok',
  'Izolovaný článok na testovanie breed relation.',
  'Život so psom',
  'clanky',
  'published',
  'forest',
  'Redakcia Psipedia',
  'Testovací obsah.',
  '',
  '[]',
  '[]',
  '[]',
  3,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  'ci:breeds-admin',
  'ci:breeds-admin'
);

INSERT INTO directory_profiles (
  id, slug, name, category, status, excerpt, description, services_json, city, region,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  973101,
  'breeds-admin-station',
  'BREEDS-ADMIN Chovateľská stanica',
  'chovatelske-stanice',
  'published',
  'Izolovaná stanica pre breed relation.',
  '',
  '[]',
  'Nitra',
  'Nitriansky kraj',
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  'ci:breeds-admin',
  'ci:breeds-admin'
);

INSERT INTO directory_profiles (
  id, slug, name, category, status, excerpt, description, services_json, city, region,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  973102,
  'breeds-admin-club',
  'BREEDS-ADMIN Chovateľský klub',
  'chovatelske-kluby',
  'published',
  'Izolovaný klub pre breed relation.',
  '',
  '[]',
  'Bratislava',
  'Bratislavský kraj',
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z',
  'ci:breeds-admin',
  'ci:breeds-admin'
);
