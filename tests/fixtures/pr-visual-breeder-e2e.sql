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
