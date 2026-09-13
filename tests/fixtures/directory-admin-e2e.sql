DELETE FROM directory_profiles WHERE slug LIKE 'e2e-directory-%';

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
