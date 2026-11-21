DELETE FROM partner_resources
WHERE directory_profile_id IN (
  SELECT id FROM directory_profiles
  WHERE slug LIKE 'e2e-directory-%'
     OR slug LIKE 'e2e-services-detail-%'
     OR slug LIKE 'health-fixture-%'
     OR slug IN ('directory-admin-editor-fixture', 'bulk-fixture-draft', 'bulk-fixture-published')
)
AND id NOT IN (SELECT resource_id FROM partner_memberships);

DELETE FROM directory_profiles WHERE slug LIKE 'e2e-directory-%';
DELETE FROM directory_profiles WHERE slug LIKE 'e2e-services-detail-%';
DELETE FROM directory_profiles WHERE slug LIKE 'health-fixture-%';
DELETE FROM directory_profiles WHERE slug IN ('directory-admin-editor-fixture', 'bulk-fixture-draft', 'bulk-fixture-published');

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 61
)
INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, city, district, region,
  created_at, updated_at, created_by, updated_by
)
SELECT
  'e2e-directory-vet-' || printf('%03d', n),
  'E2E Veterina ' || printf('%03d', n),
  'veterinari',
  'draft',
  'E2E veterinárny profil pre test serverových filtrov.',
  'Deterministický lokálny E2E profil používaný iba v CI.',
  CASE WHEN n = 61 THEN '["Fyzioterapia","Kúpanie"]' ELSE '["Preventívna starostlivosť"]' END,
  CASE WHEN n = 61 THEN 'Žilina' ELSE 'Nitra' END,
  CASE WHEN n = 61 THEN 'Žilina' ELSE 'Nitra' END,
  CASE WHEN n = 61 THEN 'Žilinský kraj' ELSE 'Nitriansky kraj' END,
  '2026-09-13T12:00:00.000Z',
  printf('2026-09-13T12:%02d:00.000Z', n % 60),
  'e2e@psipedia.local',
  'e2e@psipedia.local'
FROM seq;

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, city, region,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'e2e-directory-vet-published', 'E2E Veterina publikovaná', 'veterinari', 'published',
  'E2E publikovaný veterinárny profil pre test filtrov.', 'Deterministický lokálny E2E profil používaný iba v CI.',
  '["Pohotovosť"]', 'Bratislava', 'Bratislavský kraj', '2026-09-13T12:00:00.000Z', '2026-09-13T13:00:00.000Z',
  '2026-09-13T13:00:00.000Z', 'e2e@psipedia.local', 'e2e@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, city, region,
  created_at, updated_at, created_by, updated_by
) VALUES (
  'e2e-directory-trener-draft', 'E2E Tréner', 'treneri', 'draft',
  'E2E tréner pre test kategórie.', 'Deterministický lokálny E2E profil používaný iba v CI.',
  '["Poslušnosť"]', 'Trnava', 'Trnavský kraj', '2026-09-13T12:00:00.000Z', '2026-09-13T14:00:00.000Z',
  'e2e@psipedia.local', 'e2e@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'e2e-services-detail-long',
  'E2E Centrum komplexného výcviku, socializácie a behaviorálneho poradenstva pre psy',
  'treneri',
  'published',
  'Individuálny tréning, práca so správaním a podpora psov aj ich ľudí v Nitre a okolí.',
  'Pomáhame s praktickým tréningom v každodenných situáciách. Program prispôsobujeme konkrétnemu psovi a cieľu.',
  '["Individuálny výcvik","Výcvik šteniat","Behaviorálne poradenstvo","Online konzultácie"]',
  '["Certifikovaný tréner","Skúsenosti s citlivými psami"]',
  'Nitra',
  'Nitra',
  'Nitriansky kraj',
  'Testovacia 12',
  1,
  'Cena podľa typu konzultácie',
  'https://example.org',
  NULL,
  '{"Telefón":"+421 900 123 456","E-mail":"detail-e2e@example.invalid","Facebook":"https://facebook.com/example","Instagram":"https://instagram.com/example","Plemeno":"Labradorský retriever","Organizácia":"Fixture klub","Pokrytie":"Nitra a okolie","Individuálny výcvik":"Áno","Behaviorálne poradenstvo":"Na objednávku","Online konzultácie":"Áno"}',
  1,
  1,
  '2026-09-14T08:00:00.000Z',
  '2026-09-14T08:00:00.000Z',
  '2026-09-14T08:00:00.000Z',
  'e2e@psipedia.local',
  'e2e@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'e2e-services-detail-minimum',
  'E2E Minimálna služba',
  'dalsie-sluzby',
  'published',
  '',
  '',
  '[]',
  '[]',
  'Nitra',
  '',
  'Nitriansky kraj',
  '',
  0,
  '',
  NULL,
  NULL,
  '{}',
  0,
  0,
  '2026-09-14T08:05:00.000Z',
  '2026-09-14T08:05:00.000Z',
  '2026-09-14T08:05:00.000Z',
  'e2e@psipedia.local',
  'e2e@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'health-fixture-vet-rich',
  'Health veterinárna klinika',
  'veterinari',
  'published',
  'Veterinárny testovací profil s vyplnenými odbornými údajmi.',
  'Deterministický lokálny profil určený iba na overenie Health variantu v CI.',
  '["Preventívna starostlivosť","Chirurgia"]',
  '["Veterinárny tím"]',
  'Nitra',
  'Nitra',
  'Nitriansky kraj',
  'Testovacia 21',
  0,
  '',
  NULL,
  '/images/zdravie-veterinar.webp',
  '{"Špecializácie":"Interná medicína, chirurgia","Pohotovosť":"Áno","Hospitalizácia":"Áno","RTG":"Digitálne RTG","USG":"Áno","Laboratórium":"Interné laboratórium"}',
  1,
  0,
  '2026-09-14T09:00:00.000Z',
  '2026-09-14T09:00:00.000Z',
  '2026-09-14T09:00:00.000Z',
  'health-fixture@psipedia.local',
  'health-fixture@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'health-fixture-vet-minimum',
  'Health veterinár minimum',
  'veterinari',
  'published',
  'Veterinárny testovací profil bez použiteľných odborných údajov.',
  '',
  '["Preventívna starostlivosť"]',
  '[]',
  'Trnava',
  'Trnava',
  'Trnavský kraj',
  '',
  0,
  '',
  NULL,
  NULL,
  '{"Pohotovosť":"Neuvedené","Hospitalizácia":"Neoverené","RTG":"Nezistené"}',
  0,
  0,
  '2026-09-14T09:05:00.000Z',
  '2026-09-14T09:05:00.000Z',
  '2026-09-14T09:05:00.000Z',
  'health-fixture@psipedia.local',
  'health-fixture@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'health-fixture-fyzioterapia',
  'Health fyzioterapia',
  'fyzioterapia',
  'published',
  'Fyzioterapeutický testovací profil s terapeutickými a rehabilitačnými údajmi.',
  'Deterministický lokálny profil určený iba na overenie Health variantu v CI.',
  '["Rehabilitácia","Regenerácia"]',
  '["Veterinárny fyzioterapeut"]',
  'Bratislava',
  'Bratislava V',
  'Bratislavský kraj',
  'Testovacia 31',
  0,
  '',
  NULL,
  NULL,
  '{"Hydroterapia":"Áno","Laserterapia":"Áno","Manuálne techniky":"Mäkké a mobilizačné techniky","Pooperačná rehabilitácia":"Áno","Ortopedickí pacienti":"Áno","Odborník / certifikácia":"Veterinárny fyzioterapeut"}',
  1,
  0,
  '2026-09-14T09:10:00.000Z',
  '2026-09-14T09:10:00.000Z',
  '2026-09-14T09:10:00.000Z',
  'health-fixture@psipedia.local',
  'health-fixture@psipedia.local'
);


INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, internal_email, image_url, image_key,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'directory-admin-editor-fixture',
  'Directory Admin Editor Fixture',
  'treneri',
  'published',
  'Bezpečný repository-managed profil pre DIRECTORY-ADMIN editor E2E.',
  'Tento deterministický profil slúži iba na overenie editácie kontaktov, médií a publication stavu.',
  '["Individuálny výcvik"]',
  '["Testovacia kvalifikácia"]',
  'Nitra',
  'Nitra',
  'Nitriansky kraj',
  'Testovacia 99',
  1,
  'Testovacia cena',
  'https://example.org/original',
  'internal-fixture@example.invalid',
  'https://example.org/directory-admin-fixture.jpg',
  NULL,
  '{"Telefón":"+421 900 111 222","E-mail":"public-fixture@example.invalid","Facebook":"https://facebook.com/original-fixture","Instagram":"https://instagram.com/original-fixture","Plemeno":"Labradorský retriever","Organizácia":"Fixture klub","Pokrytie":"Nitra a okolie"}',
  1,
  1,
  '2026-09-18T18:00:00.000Z',
  '2026-09-18T18:00:00.000Z',
  '2026-09-18T18:00:00.000Z',
  'fixture@psipedia.local',
  'fixture@psipedia.local'
);

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, image_url,
  source_data_json, verified, featured, created_at, updated_at, published_at, created_by, updated_by
) VALUES
(
  'bulk-fixture-draft',
  'Bulk Fixture Draft',
  'dalsie-sluzby',
  'draft',
  'Bezpečný koncept pre test directory bulk publikovania.',
  'Deterministický profil určený iba na bezpečný E2E test hromadnej zmeny publication stavu.',
  '["Testovacia služba"]',
  '[]',
  'Nitra', 'Nitra', 'Nitriansky kraj', '', 0, '', NULL, NULL, '{}', 0, 0,
  '2026-09-18T18:10:00.000Z', '2026-09-18T18:10:00.000Z', NULL,
  'fixture@psipedia.local', 'fixture@psipedia.local'
),
(
  'bulk-fixture-published',
  'Bulk Fixture Published',
  'dalsie-sluzby',
  'published',
  'Bezpečný publikovaný profil pre test directory bulk presunu do konceptu.',
  'Deterministický profil určený iba na bezpečný E2E test hromadnej zmeny publication stavu.',
  '["Testovacia služba"]',
  '[]',
  'Nitra', 'Nitra', 'Nitriansky kraj', '', 0, '', NULL, NULL, '{}', 0, 0,
  '2026-09-18T18:11:00.000Z', '2026-09-18T18:11:00.000Z', '2026-09-18T18:11:00.000Z',
  'fixture@psipedia.local', 'fixture@psipedia.local'
);

-- This fixture intentionally seeds both the historical profile columns and
-- their current relational SQL owner. Public Directory reads service lines
-- from directory_profile_service_texts after SQL cutover, never services_json.
-- Only local E2E fixture profiles are included; no production transfer.
INSERT INTO directory_profile_service_texts
  (profile_id, item_order, service_text, updated_at, updated_by)
SELECT profile.id, CAST(item.key AS INTEGER), item.value,
       profile.updated_at, profile.updated_by
FROM directory_profiles AS profile
JOIN json_each(profile.services_json) AS item
WHERE (
  profile.slug LIKE 'e2e-directory-%'
  OR profile.slug LIKE 'e2e-services-detail-%'
  OR profile.slug LIKE 'health-fixture-%'
  OR profile.slug IN (
    'directory-admin-editor-fixture',
    'bulk-fixture-draft', 'bulk-fixture-published'
  )
)
  AND item.type = 'text'
  AND trim(item.value) <> ''
ON CONFLICT (profile_id, item_order) DO UPDATE SET
  service_text = excluded.service_text,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;


-- SQL-only public/profile fixtures after Directory 0170/0173 cutover.
-- Keep the legacy source JSON untouched on purpose: these assertions must
-- pass using ONLY canonical SQL, not historical contact/fact fallbacks.
UPDATE directory_profiles SET
  public_phone = '+421 900 123 456',
  public_email = 'detail-e2e@example.invalid',
  facebook_url = 'https://facebook.com/example',
  instagram_url = 'https://instagram.com/example'
WHERE slug = 'e2e-services-detail-long';

UPDATE directory_profiles SET
  public_phone = '+421 900 111 222',
  public_email = 'public-fixture@example.invalid',
  facebook_url = 'https://facebook.com/original-fixture',
  instagram_url = 'https://instagram.com/original-fixture'
WHERE slug = 'directory-admin-editor-fixture';

-- D1's SQLite runtime rejects compound SELECTs over its small term limit.
-- VALUES is not a compound SELECT; editorial facts use canonical SQL.
WITH facts(slug, field_key, value_text) AS (
  VALUES
    ('health-fixture-vet-rich', 'Špecializácie', 'Interná medicína, chirurgia'),
    ('health-fixture-vet-rich', 'Hospitalizácia', 'Áno'),
    ('health-fixture-vet-rich', 'RTG', 'Digitálne RTG'),
    ('health-fixture-vet-rich', 'USG', 'Áno'),
    ('health-fixture-vet-rich', 'Laboratórium', 'Interné laboratórium'),
    ('e2e-services-detail-long', 'Pokrytie', 'Nitra a okolie'),
    ('directory-admin-editor-fixture', 'Pokrytie', 'Nitra a okolie')
)
INSERT INTO directory_profile_public_facts
  (profile_id, field_key, value_text, updated_at, updated_by)
SELECT p.id, f.field_key, f.value_text, p.updated_at, p.updated_by
FROM directory_profiles p
JOIN facts f ON f.slug = p.slug;

INSERT INTO directory_profile_filter_values
  (profile_id, category, filter_id, value_text, updated_at, updated_by)
SELECT id, 'veterinari', 'veterinari.emergency', 'yes', updated_at, updated_by
FROM directory_profiles WHERE slug = 'health-fixture-vet-rich';
