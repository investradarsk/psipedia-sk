DELETE FROM directory_profiles WHERE slug LIKE 'e2e-directory-%';
DELETE FROM directory_profiles WHERE slug LIKE 'e2e-services-detail-%';

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 61
)
INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json, city, region,
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
  '{"Telefón":"+421 900 123 456","E-mail":"detail-e2e@example.invalid","Facebook":"https://facebook.com/example","Instagram":"https://instagram.com/example","Pokrytie":"Nitra a okolie","Individuálny výcvik":"Áno","Behaviorálne poradenstvo":"Na objednávku","Online konzultácie":"Áno"}',
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
