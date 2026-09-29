-- CONTENT-RELATIONS-1: isolated local D1 fixtures only.
DELETE FROM breed_article_relations WHERE article_id BETWEEN 991101 AND 991199;
DELETE FROM breed_directory_relations WHERE profile_id BETWEEN 991101 AND 991199;
DELETE FROM adoption_dogs WHERE id BETWEEN 991201 AND 991299;
DELETE FROM help_organizations WHERE id BETWEEN 991201 AND 991299;
DELETE FROM directory_profiles WHERE id BETWEEN 991101 AND 991199;
DELETE FROM managed_articles WHERE id BETWEEN 991101 AND 991199;

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, canonical_url, noindex,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES
  (
    991101, 'content-relations-e2e-clanok', 'CONTENT-RELATIONS E2E článok',
    'Izolovaný článok s explicitnou väzbou na plemeno.', 'Život so psom', 'clanky', 'published',
    'forest', 'Redakcia Psipedia', 'Verejný fixture obsah pre relation E2E.', '',
    '[]', '[]', '[]', 3, '', 0,
    '2026-09-30T00:10:00.000Z', '2026-09-30T00:10:00.000Z', '2026-09-30T00:10:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991102, 'content-relations-e2e-bez-vazby', 'CONTENT-RELATIONS E2E bez väzby',
    'Izolovaný článok bez explicitnej väzby.', 'Život so psom', 'clanky', 'published',
    'forest', 'Redakcia Psipedia', 'Verejný fixture bez related entity.', '',
    '[]', '[]', '[]', 2, '', 0,
    '2026-09-30T00:11:00.000Z', '2026-09-30T00:11:00.000Z', '2026-09-30T00:11:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991103, 'content-relations-e2e-draft-target', 'CONTENT-RELATIONS skrytý draft článok',
    'Tento draft nesmie byť related target.', 'Život so psom', 'clanky', 'draft',
    'forest', 'Redakcia Psipedia', 'Draft.', '',
    '[]', '[]', '[]', 2, '', 0,
    '2026-09-30T00:12:00.000Z', '2026-09-30T00:12:00.000Z', NULL,
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991104, 'content-relations-e2e-noncanonical-target', 'CONTENT-RELATIONS noncanonical článok',
    'Tento článok má canonical na inú URL.', 'Život so psom', 'clanky', 'published',
    'forest', 'Redakcia Psipedia', 'Noncanonical.', '',
    '[]', '[]', '[]', 2, 'https://psipedia.sk/clanky/content-relations-e2e-clanok', 0,
    '2026-09-30T00:13:00.000Z', '2026-09-30T00:13:00.000Z', '2026-09-30T00:13:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  );

INSERT INTO directory_profiles (
  id, slug, name, category, status, excerpt, description, services_json,
  city, region, seo_json, archived_at,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES
  (
    991101, 'content-relations-e2e-klub', 'CONTENT-RELATIONS E2E chovateľský klub',
    'chovatelske-kluby', 'published', 'Izolovaný profil s explicitnou väzbou na plemeno.',
    'Fixture profil pre verejné relation E2E.', '[]', 'Nitra', 'Nitriansky kraj', '{}', NULL,
    '2026-09-30T00:20:00.000Z', '2026-09-30T00:20:00.000Z', '2026-09-30T00:20:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991102, 'content-relations-e2e-profil-bez-vazby', 'CONTENT-RELATIONS E2E profil bez väzby',
    'chovatelske-kluby', 'published', 'Izolovaný profil bez explicitnej väzby.',
    'Fixture profil bez related entity.', '[]', 'Nitra', 'Nitriansky kraj', '{}', NULL,
    '2026-09-30T00:21:00.000Z', '2026-09-30T00:21:00.000Z', '2026-09-30T00:21:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991103, 'content-relations-e2e-archived-station', 'CONTENT-RELATIONS archivovaná stanica',
    'chovatelske-stanice', 'published', 'Archivovaný target.', '', '[]',
    'Nitra', 'Nitriansky kraj', '{}', '2026-09-30T00:22:00.000Z',
    '2026-09-30T00:22:00.000Z', '2026-09-30T00:22:00.000Z', '2026-09-30T00:22:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  ),
  (
    991104, 'content-relations-e2e-noncanonical-club', 'CONTENT-RELATIONS noncanonical klub',
    'chovatelske-kluby', 'published', 'Noncanonical target.', '', '[]',
    'Nitra', 'Nitriansky kraj',
    '{"canonicalUrl":"https://psipedia.sk/adresar/chovatelske-kluby/content-relations-e2e-klub"}', NULL,
    '2026-09-30T00:23:00.000Z', '2026-09-30T00:23:00.000Z', '2026-09-30T00:23:00.000Z',
    'ci:content-relations', 'ci:content-relations'
  );

INSERT INTO breed_article_relations (breed_id, article_id, created_at, created_by)
SELECT id, 991101, '2026-09-30T00:30:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak'
UNION ALL
SELECT id, 991103, '2026-09-30T00:30:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak'
UNION ALL
SELECT id, 991104, '2026-09-30T00:30:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak';

INSERT INTO breed_directory_relations (breed_id, profile_id, created_at, created_by)
SELECT id, 991101, '2026-09-30T00:31:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak'
UNION ALL
SELECT id, 991103, '2026-09-30T00:31:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak'
UNION ALL
SELECT id, 991104, '2026-09-30T00:31:00.000Z', 'ci:content-relations'
FROM managed_breeds WHERE slug = 'biely-svajciarsky-ovciak';

INSERT INTO help_organizations (
  id, name, slug, type, status, short_description, description,
  city, region, country_code, seo_json,
  published_at, created_at, updated_at, created_by, updated_by
) VALUES (
  991201, 'CONTENT-RELATIONS E2E organizácia', 'content-relations-e2e-organizacia',
  'CIVIC_ASSOCIATION', 'PUBLISHED', 'Izolovaná organizácia s bounded adopciami.',
  'Fixture organizácia určená iba pre lokálne CI.', 'Nitra', 'Nitriansky kraj', 'SK', '{}',
  '2026-09-30T00:40:00.000Z', '2026-09-30T00:40:00.000Z', '2026-09-30T00:40:00.000Z',
  'ci:content-relations', 'ci:content-relations'
);

INSERT INTO adoption_dogs (
  id, name, slug, status, sex, size, breed_name, region, district, city,
  organization_id, organization_name, organization_slug,
  short_description, description, search_text,
  published_at, last_verified_at, created_at, updated_at, created_by, updated_by
) VALUES
  (991201,'CR Pes 1','cr-pes-1','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 1','2026-09-30T00:41:00.000Z','2026-09-30T00:41:00.000Z','2026-09-30T00:41:00.000Z','2026-09-30T00:41:00.000Z','ci:content-relations','ci:content-relations'),
  (991202,'CR Pes 2','cr-pes-2','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 2','2026-09-30T00:42:00.000Z','2026-09-30T00:42:00.000Z','2026-09-30T00:42:00.000Z','2026-09-30T00:42:00.000Z','ci:content-relations','ci:content-relations'),
  (991203,'CR Pes 3','cr-pes-3','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 3','2026-09-30T00:43:00.000Z','2026-09-30T00:43:00.000Z','2026-09-30T00:43:00.000Z','2026-09-30T00:43:00.000Z','ci:content-relations','ci:content-relations'),
  (991204,'CR Pes 4','cr-pes-4','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 4','2026-09-30T00:44:00.000Z','2026-09-30T00:44:00.000Z','2026-09-30T00:44:00.000Z','2026-09-30T00:44:00.000Z','ci:content-relations','ci:content-relations'),
  (991205,'CR Pes 5','cr-pes-5','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 5','2026-09-30T00:45:00.000Z','2026-09-30T00:45:00.000Z','2026-09-30T00:45:00.000Z','2026-09-30T00:45:00.000Z','ci:content-relations','ci:content-relations'),
  (991206,'CR Pes 6','cr-pes-6','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 6','2026-09-30T00:46:00.000Z','2026-09-30T00:46:00.000Z','2026-09-30T00:46:00.000Z','2026-09-30T00:46:00.000Z','ci:content-relations','ci:content-relations'),
  (991207,'CR Pes 7','cr-pes-7','ACTIVE','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr pes 7','2026-09-30T00:47:00.000Z','2026-09-30T00:47:00.000Z','2026-09-30T00:47:00.000Z','2026-09-30T00:47:00.000Z','ci:content-relations','ci:content-relations'),
  (991208,'CR Draft pes','cr-draft-pes','DRAFT','MALE','MEDIUM','','Nitriansky kraj','Nitra','Nitra',991201,'CONTENT-RELATIONS E2E organizácia','content-relations-e2e-organizacia','','','cr draft pes',NULL,'2026-09-30T00:48:00.000Z','2026-09-30T00:48:00.000Z','2026-09-30T00:48:00.000Z','ci:content-relations','ci:content-relations');
