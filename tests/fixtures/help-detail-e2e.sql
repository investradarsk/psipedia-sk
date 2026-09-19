-- Public presentation fixtures in local D1 only; never run against remote D1.
-- Canonical shelter fixture. No legacy help_cases.utulky row is seeded:
-- the legacy route must redirect without depending on one.
INSERT INTO help_organizations (
  id, name, slug, legal_name, type, status, short_description, description,
  public_email, public_phone, website_url, city, district, region, country_code,
  source_data_json, seo_json, published_at, last_verified_at,
  created_at, updated_at, created_by, updated_by
) VALUES (
  920001, 'E2E pomocná organizácia', 'e2e-organizacia', 'E2E pomocná organizácia, o.z.',
  'CIVIC_ASSOCIATION', 'PUBLISHED', 'Canonical profil pre ORG-6C E2E.',
  'Pomáhame psom. Dobrovoľníctvo: venčenie. Materiálna pomoc: deky.',
  'help-e2e@example.invalid', '+421 900 123 456', 'https://example.org',
  'Nitra', 'Nitra', 'Nitriansky kraj', 'SK', '{}', '{}',
  '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z',
  '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'
);

INSERT INTO help_cases (
  id, slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
  city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
  goal_amount, raised_amount, verified, urgent, resolved, created_at, updated_at, published_at, created_by, updated_by
) VALUES
  (920002, 'e2e-adopcia', 'E2E adopcia psa', 'adopcia', 'published', 'Hľadá domov.',
   'Pokojný pes hľadá domov.\n\nRád chodí na prechádzky.', 'E2E pomocná organizácia', 'Beny', 'Labrador', '',
   'Nitra', 'Nitriansky kraj', '', '2026-09-14', NULL, 'Zistiť viac', NULL, 'Neuvedené', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920003, 'e2e-docasna-opatera', 'E2E dočasná opatera', 'docasna-opatera', 'published', 'Potrebujeme opateru.',
   'Dočasná opatera pre psa.', 'E2E pomocná organizácia', 'Max', '', 'Nezistené',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Zistiť viac', NULL, '', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920004, 'e2e-zbierka', 'E2E finančná výzva', 'zbierky', 'published', 'Pomoc s nákladmi.',
   'Prispejte na starostlivosť.', 'E2E pomocná organizácia', '', '', '',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Podporiť', 'https://example.org/darovat', '', 10000, 3500, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920005, 'e2e-dobrovolnictvo', 'E2E dobrovoľnícka výzva', 'dobrovolnictvo', 'published', 'Zapojte sa.',
   'Popis: Pomôžte venčením. Dobrovoľníctvo: prechádzky', 'E2E pomocná organizácia', '', '', '',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Zistiť viac', NULL, '', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL');

-- Published legacy adoption shadows for canonical-only lifecycle regression tests.
-- The matching canonical fixtures are DRAFT, ADOPTED and ARCHIVED; none may fall back here.
INSERT INTO help_cases (
  id, slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
  city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
  goal_amount, raised_amount, verified, urgent, resolved, created_at, updated_at, published_at, created_by, updated_by
)
SELECT 920010, 'e2e-adoption-draft-private', 'Legacy shadow draft', category, status, excerpt, description,
  organization, 'E2E Draft Private', breed, age_note, city, region, location_note, reported_date, deadline_date,
  action_label, action_url, contact_note, goal_amount, raised_amount, verified, urgent, resolved,
  created_at, updated_at, published_at, created_by, updated_by
FROM help_cases WHERE id = 920002
UNION ALL
SELECT 920011, 'e2e-adoption-adopted-private', 'Legacy shadow adopted', category, status, excerpt, description,
  organization, 'E2E Adopted Private', breed, age_note, city, region, location_note, reported_date, deadline_date,
  action_label, action_url, contact_note, goal_amount, raised_amount, verified, urgent, resolved,
  created_at, updated_at, published_at, created_by, updated_by
FROM help_cases WHERE id = 920002
UNION ALL
SELECT 920012, 'e2e-adoption-archived-private', 'Legacy shadow archived', category, status, excerpt, description,
  organization, 'E2E Archived Private', breed, age_note, city, region, location_note, reported_date, deadline_date,
  action_label, action_url, contact_note, goal_amount, raised_amount, verified, urgent, resolved,
  created_at, updated_at, published_at, created_by, updated_by
FROM help_cases WHERE id = 920002;

-- Disposable drafts for Admin Help bulk-selection/pagination tests. They are never published by E2E.
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 65)
INSERT INTO help_cases (
  id, slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
  city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
  goal_amount, raised_amount, verified, urgent, resolved, created_at, updated_at, published_at, created_by, updated_by
)
SELECT
  930000 + n, 'e2e-bulk-draft-' || n,
  CASE WHEN n = 65 THEN 'E2E bulk Žltý koncept' ELSE 'E2E bulk koncept ' || n END,
  'dobrovolnictvo', 'draft',
  'Lokálny koncept pre bezpečný E2E test.', 'Tento záznam existuje iba v lokálnej testovacej D1 a nesmie sa publikovať.',
  CASE WHEN n = 65 THEN 'E2E Žltá organizácia' ELSE 'E2E bulk organizácia' END, '', '', '',
  CASE WHEN n = 65 THEN 'Žilina' WHEN n % 2 = 0 THEN 'Trnava' ELSE 'Nitra' END,
  CASE WHEN n = 65 THEN 'Žilinský kraj' ELSE 'Nitriansky kraj' END,
  CASE WHEN n = 65 THEN 'Čadca a okolie' ELSE '' END,
  NULL, NULL, 'Zistiť viac', NULL, '', NULL, NULL, 0,
  CASE WHEN n = 64 THEN 1 ELSE 0 END,
  CASE WHEN n = 63 THEN 1 ELSE 0 END,
  '2026-09-14T11:00:00Z', printf('2026-09-14T11:%02d:00Z', n % 60), NULL, 'E2E_LOCAL', 'E2E_LOCAL'
FROM seq;
