DELETE FROM directory_profiles WHERE slug LIKE 'search-e2e-%';

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 505
)
INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json,
  city, district, region, search_text,
  created_at, updated_at, published_at, created_by, updated_by
)
SELECT
  'search-e2e-vet-' || printf('%03d', n),
  'SEARCH E2E Ambulancia ' || printf('%03d', n),
  'veterinari',
  'published',
  'Lokálny SEARCH-1 testovací veterinárny profil.',
  'Deterministický profil používaný iba v izolovanej lokálnej CI databáze.',
  '["Preventívna starostlivosť"]',
  'Trnava',
  'Trnava',
  'Trnavský kraj',
  'search e2e ambulancia ' || printf('%03d', n) || ' veterinar veterina trnava preventivna starostlivost',
  '2026-09-28T12:00:00.000Z',
  '2026-09-28T12:00:00.000Z',
  '2026-09-28T12:00:00.000Z',
  'search-e2e@psipedia.local',
  'search-e2e@psipedia.local'
FROM seq;

INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description, services_json,
  city, district, region, search_text,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  'search-e2e-target-506',
  'SEARCH E2E Zzz Veterina 506',
  'veterinari',
  'published',
  'Profil za historickou 500-položkovou hranicou.',
  'Musí zostať nájditeľný presným názvom bez ohľadu na poradie v adresári.',
  '["Pohotovosť"]',
  'Trnava',
  'Trnava',
  'Trnavský kraj',
  'search e2e zzz veterina 506 veterinar trnava pohotovost',
  '2026-09-28T12:00:00.000Z',
  '2026-09-28T12:00:00.000Z',
  '2026-09-28T12:00:00.000Z',
  'search-e2e@psipedia.local',
  'search-e2e@psipedia.local'
);
