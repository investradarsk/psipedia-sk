-- Disposable PR Visual Evidence fixture, not a production record.
-- The title/route match Malkia Garden, but all other editorial/contact
-- fields and the stock image are layout-only examples, NOT verified facts.
-- Execute only with wrangler --local in the isolated CI D1 database.
INSERT INTO directory_profiles (
  slug, name, category, status, excerpt, description,
  services_json, qualifications_json,
  city, district, region, address, website_url, image_url,
  source_data_json, verified, featured,
  created_at, updated_at, published_at, created_by, updated_by
)
SELECT
  'malkia-garden',
  'Malkia Garden',
  'chovatelske-stanice',
  'published',
  'CI vizuálna ukážka chovateľského profilu. Kontakty a fotografia sú testovacie.',
  'Testovacia fotografia a obsah slúžia len na porovnanie rozloženia pred a po úprave. Nejde o aktuálne údaje chovateľskej stanice.\n\nDruhý odsek ukážkového textu umožňuje overiť čitateľnosť na mobile.',
  '[]',
  '["Ukážkový údaj o chove – iba CI","Dlhšia skúšobná poznámka pre rozbaľovacie informácie o chovateľovi."]',
  'Nevidzany',
  'Zlaté Moravce',
  'Nitriansky kraj',
  '',
  NULL,
  '/images/hero-labrador.webp',
  '{"Telefón":"Ukážkový kontakt (iba CI)","E-mail":"visual-ci@example.invalid","Web":"example.invalid","Facebook":"Ukážkový údaj (iba CI)","Instagram":"Ukážkový údaj (iba CI)","Chovateľ":"Testovacia hodnota (iba CI)","Aktívny chov":"Testovacia hodnota (iba CI)","Aktuálne vrhy":"Ukážková informácia (iba CI)","Plánované vrhy":"Ukážková informácia (iba CI)"}',
  0,
  0,
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  'pr-visual@psipedia.local',
  'pr-visual@psipedia.local'
WHERE NOT EXISTS (
  SELECT 1 FROM directory_profiles WHERE slug = 'malkia-garden'
);

-- Disposable homepage card with a long provider name. The local media key
-- intentionally has no object; the fallback still exercises the title layout.
-- Explicit local-only ID keeps the numeric Admin detail route deterministic.
INSERT OR IGNORE INTO directory_profiles (
  id, slug, name, category, status, excerpt, description, city, region, image_url, image_key,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES (
  980001, 'vizualna-ukazka-veterinara',
  'Veterinárna ambulancia MVDr. Ukážkové meno',
  'veterinari',
  'published',
  'Ukážka dlhého názvu pre vizuálnu kontrolu.',
  'Izolovaný profil bez produkčných údajov.',
  'Bratislava - Nové Mesto',
  'Bratislavský kraj',
  '/media/visual-ci/provider.webp',
  'visual-ci/provider.webp',
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  'pr-visual@psipedia.local',
  'pr-visual@psipedia.local'
);

-- The same canonical Irish wolfhound is seeded by bootstrap-breed-e2e on
-- the PR and common-ancestor builds; show a real relational breed link.
INSERT OR IGNORE INTO breed_directory_relations (
  breed_id, profile_id, relation_type, source, created_at, created_by
)
SELECT b.id, p.id, 'BREED', 'e2e', '2026-11-17T12:00:00.000Z', 'pr-visual@psipedia.local'
FROM managed_breeds AS b
JOIN directory_profiles AS p
  ON p.slug = 'malkia-garden' AND p.category = 'chovatelske-stanice'
WHERE b.slug = 'irsky-vlkodav' AND b.status = 'published';

-- Disposable organization photo to compare the compact mobile hero in natural mode.
INSERT OR IGNORE INTO help_organizations (
  slug, name, type, status, short_description, description, image_url,
  published_at, created_at, updated_at, created_by, updated_by
) VALUES (
  'vizualna-ukazka-organizacie',
  'Vizuálna ukážka organizácie',
  'CIVIC_ASSOCIATION',
  'PUBLISHED',
  'Izolovaný profil na kontrolu zobrazenia celej fotografie na mobile.',
  'Ukážkový obsah pre vizuálnu kontrolu.',
  '/images/hero-labrador.webp',
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  '2026-11-17T12:00:00.000Z',
  'pr-visual@psipedia.local',
  'pr-visual@psipedia.local'
);

-- Local SEO visual fixture: Nitra city and district have identical profile
-- membership, while the region has an additional hotel in another district.
-- This exercises the actual canonical target rather than an empty 404 page.
-- PrimaVet is a route-matching layout placeholder, not verified provider data.
INSERT OR IGNORE INTO directory_profiles (
  slug, name, category, status, excerpt, description,
  city, district, region, image_url, created_at, updated_at, published_at,
  created_by, updated_by
) VALUES
  (
    'visual-ci-hotel-nitra-a', 'Ukážkový psí hotel Nitra A',
    'hotely-a-opatrovanie', 'published',
    'Testovací profil hotela pre vizuálnu kontrolu.',
    'Izolované testovacie údaje, nie skutočná služba.',
    'Nitra', 'Nitra', 'Nitriansky kraj', '/images/hero-labrador.webp',
    '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z',
    'pr-visual@psipedia.local', 'pr-visual@psipedia.local'
  ),
  (
    'visual-ci-hotel-nitra-b', 'Ukážkový psí hotel Nitra B',
    'hotely-a-opatrovanie', 'published',
    'Testovací profil opatrovania pre vizuálnu kontrolu.',
    'Izolované testovacie údaje, nie skutočná služba.',
    'Nitra', 'Nitra', 'Nitriansky kraj', '/images/hero-labrador.webp',
    '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z',
    'pr-visual@psipedia.local', 'pr-visual@psipedia.local'
  ),
  (
    'visual-ci-hotel-zlate-moravce', 'Ukážkový psí hotel Zlaté Moravce',
    'hotely-a-opatrovanie', 'published',
    'Testovací profil v inom okrese pre kontrolu odlišného zoznamu.',
    'Izolované testovacie údaje, nie skutočná služba.',
    'Zlaté Moravce', 'Zlaté Moravce', 'Nitriansky kraj', '/images/hero-labrador.webp',
    '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z',
    'pr-visual@psipedia.local', 'pr-visual@psipedia.local'
  ),
  (
    'veterinarna-klinika-primavet', 'PrimaVet – vizuálna ukážka',
    'veterinari', 'published',
    'Testovací profil na zobrazenie prioritného interného odkazu.',
    'Izolované testovacie údaje, nie overené údaje poskytovateľa.',
    'Bratislava - Rača', 'Bratislava III', 'Bratislavský kraj', '/images/hero-labrador.webp',
    '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z', '2026-11-17T12:00:00.000Z',
    'pr-visual@psipedia.local', 'pr-visual@psipedia.local'
  );

-- Local editorial fixture for the SEO link source. The slug matches the
-- reviewed route; the text and photo are disposable layout examples only.
INSERT OR IGNORE INTO managed_articles (
  slug, title, excerpt, category, portal_section, portal_subpage,
  status, accent, author, intro, takeaway, sections_json,
  image_url, image_alt, reading_minutes, published_at, created_at, updated_at,
  created_by, updated_by
) VALUES (
  'kedy-ist-so-psom-k-veterinarovi',
  'Kedy ísť so psom k veterinárovi – vizuálna ukážka',
  'Izolovaný článok na kontrolu interných odkazov.',
  'Zdravie', 'starostlivost', 'zdravie', 'published', 'forest',
  'E2E Psipedia',
  'Tento testovací text slúži výhradne na porovnanie rozloženia článku.',
  'Ukážka pre lokálnu vizuálnu kontrolu, nie veterinárne odporúčanie.',
  '[{"heading":"Ukážková časť článku","paragraphs":["Deterministický obsah na overenie bloku súvisiacich odkazov."]}]',
  '/images/zdravie-veterinar.webp', 'Ukážková fotografia pre CI', 2,
  '2026-01-15T12:00:00.000Z', '2026-01-15T12:00:00.000Z', '2026-01-15T12:00:00.000Z',
  'pr-visual@psipedia.local', 'pr-visual@psipedia.local'
);
