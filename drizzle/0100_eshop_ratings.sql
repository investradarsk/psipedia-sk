CREATE TABLE IF NOT EXISTS managed_eshops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS managed_eshops_public_idx
  ON managed_eshops(status, name);

CREATE TABLE IF NOT EXISTS eshop_ratings (
  id TEXT PRIMARY KEY,
  eshop_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  delivery_rating INTEGER NOT NULL CHECK (delivery_rating BETWEEN 1 AND 5),
  communication_rating INTEGER NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
  assortment_rating INTEGER NOT NULL CHECK (assortment_rating BETWEEN 1 AND 5),
  price_rating INTEGER NOT NULL CHECK (price_rating BETWEEN 1 AND 5),
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (eshop_id) REFERENCES managed_eshops(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_id) REFERENCES review_authors(id) ON DELETE RESTRICT,
  UNIQUE(eshop_id, author_id)
);

CREATE INDEX IF NOT EXISTS eshop_ratings_eshop_updated_idx
  ON eshop_ratings(eshop_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS eshop_ratings_author_updated_idx
  ON eshop_ratings(author_id, updated_at DESC);

INSERT OR IGNORE INTO managed_eshops
  (slug,name,website_url,description,source_url,status,created_at,updated_at,published_at,created_by,updated_by)
VALUES
  (
    'super-zoo',
    'Super zoo',
    'https://www.superzoo.sk/',
    'E-shop s chovateľskými potrebami pre psy a ďalšie domáce zvieratá. V ponuke pre psy má krmivo a pochúťky, hračky, potreby na venčenie, cestovanie, starostlivosť aj výcvik.',
    'https://www.superzoo.sk/psy/',
    'published',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    'system:eshop-reviews-1',
    'system:eshop-reviews-1'
  ),
  (
    'petcenter',
    'PetCenter',
    'https://www.petcenter.sk/',
    'E-shop s chovateľskými potrebami pre psy a ďalšie zvieratá. Ponúka krmivá, hračky a ďalší sortiment pre starostlivosť o domáce zvieratá.',
    'https://www.petcenter.sk/',
    'published',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    'system:eshop-reviews-1',
    'system:eshop-reviews-1'
  ),
  (
    'zoohit',
    'zoohit',
    'https://www.zoohit.sk/',
    'Online obchod s chovateľskými potrebami. Slovenská ponuka pre psy zahŕňa krmivo, maškrty, pelechy, hračky, obojky a vodítka, cestovateľské aj smart doplnky.',
    'https://www.zoohit.sk/shop/psi',
    'published',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    'system:eshop-reviews-1',
    'system:eshop-reviews-1'
  ),
  (
    'spokojny-pes',
    'SpokojnýPes',
    'https://www.spokojnypes.sk/',
    'E-shop zameraný na potreby pre psy a mačky. Pre psov ponúka napríklad granule, hračky, maškrty, pelechy a ďalšie chovateľské potreby.',
    'https://www.spokojnypes.sk/',
    'published',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    'system:eshop-reviews-1',
    'system:eshop-reviews-1'
  ),
  (
    'abc-zoo',
    'ABC-ZOO',
    'https://abc-zoo.sk/',
    'Slovenský e-shop s chovateľskými potrebami pre psy a ďalšie zvieratá. Sortiment pre psy zahŕňa krmivá, pamlsky, hračky, misky, pelechy, oblečenie, prepravky aj ďalšie doplnky.',
    'https://abc-zoo.sk/100-potreby-pre-psov',
    'published',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z',
    'system:eshop-reviews-1',
    'system:eshop-reviews-1'
  );
