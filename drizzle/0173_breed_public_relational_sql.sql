-- 0173: PUBLIC BREED DATA ONLY. No legacy JSON export/copy or hidden editor fields.
-- Additive preparation: application read/write cutover must precede deletion of old columns.
-- Public scope: /plemena, detail, FCI standard, comparison, sitemap and metadata.
CREATE TABLE IF NOT EXISTS breed_public_profile (
  breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  "editorial_overview" TEXT NOT NULL DEFAULT '',
  "editorial_coat_care" TEXT NOT NULL DEFAULT '',
  "editorial_family_life" TEXT NOT NULL DEFAULT '',
  "editorial_other_dogs_life" TEXT NOT NULL DEFAULT '',
  "editorial_curiosities" TEXT NOT NULL DEFAULT '',
  "editorial_common_owner_mistakes" TEXT NOT NULL DEFAULT '',
  "fci_celkovy_vzhlad" TEXT NOT NULL DEFAULT '',
  "fci_dolezite_proporcie" TEXT NOT NULL DEFAULT '',
  "fci_povaha_temperament" TEXT NOT NULL DEFAULT '',
  "fci_hlava_lebecna_cast" TEXT NOT NULL DEFAULT '',
  "fci_hlava_tvarova_cast" TEXT NOT NULL DEFAULT '',
  "fci_oci" TEXT NOT NULL DEFAULT '',
  "fci_usi" TEXT NOT NULL DEFAULT '',
  "fci_krk" TEXT NOT NULL DEFAULT '',
  "fci_telo" TEXT NOT NULL DEFAULT '',
  "fci_chvost" TEXT NOT NULL DEFAULT '',
  "fci_predne_koncatiny" TEXT NOT NULL DEFAULT '',
  "fci_zadne_koncatiny" TEXT NOT NULL DEFAULT '',
  "fci_pohyb" TEXT NOT NULL DEFAULT '',
  "fci_koza" TEXT NOT NULL DEFAULT '',
  "fci_srst" TEXT NOT NULL DEFAULT '',
  "fci_farba" TEXT NOT NULL DEFAULT '',
  "fci_vyska_pes_cm" TEXT NOT NULL DEFAULT '',
  "fci_vyska_suka_cm" TEXT NOT NULL DEFAULT '',
  "fci_hmotnost_pes_kg" TEXT NOT NULL DEFAULT '',
  "fci_hmotnost_suka_kg" TEXT NOT NULL DEFAULT '',
  "fci_chyby" TEXT NOT NULL DEFAULT '',
  "fci_zavazne_chyby" TEXT NOT NULL DEFAULT '',
  "fci_diskvalifikacne_chyby" TEXT NOT NULL DEFAULT '',
  "fci_zdroj_poznamka" TEXT NOT NULL DEFAULT '',
  "fci_fci_standard_pdf" TEXT NOT NULL DEFAULT '',
  "seo_title" TEXT NOT NULL DEFAULT '',
  "seo_description" TEXT NOT NULL DEFAULT '',
  "seo_focus_keyword" TEXT NOT NULL DEFAULT '',
  "seo_canonical_url" TEXT NOT NULL DEFAULT '',
  "seo_og_title" TEXT NOT NULL DEFAULT '',
  "seo_og_description" TEXT NOT NULL DEFAULT '',
  "seo_noindex" REAL NOT NULL DEFAULT 0,
  "controlled_fci_group_select" TEXT NOT NULL DEFAULT '',
  "controlled_fci_section_select" TEXT NOT NULL DEFAULT '',
  "controlled_size_select" TEXT NOT NULL DEFAULT '',
  "controlled_height_min_cm" REAL,
  "controlled_height_max_cm" REAL,
  "controlled_weight_min_kg" REAL,
  "controlled_weight_max_kg" REAL,
  "controlled_lifespan_min_years" REAL,
  "controlled_lifespan_max_years" REAL
);

CREATE TABLE IF NOT EXISTS breed_public_list_items (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('healthRisks','goodFor','consider','originCountries','coatTypes','useTypes')),
  position INTEGER NOT NULL CHECK (position >= 0),
  value TEXT NOT NULL,
  PRIMARY KEY (breed_id, kind, position)
);
CREATE INDEX IF NOT EXISTS breed_public_list_kind_idx ON breed_public_list_items(kind, breed_id);

CREATE TABLE IF NOT EXISTS breed_public_gallery (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  image_url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (breed_id, position)
);
CREATE TABLE IF NOT EXISTS breed_public_sports (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  sport_key TEXT NOT NULL,
  label TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (breed_id, position)
);
CREATE TABLE IF NOT EXISTS breed_public_sources (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (breed_id, position)
);
CREATE TABLE IF NOT EXISTS breed_public_related_breeds (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  related_breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (breed_id, related_breed_id),
  UNIQUE (breed_id, position),
  CHECK (breed_id <> related_breed_id)
);
CREATE INDEX IF NOT EXISTS breed_public_related_target_idx ON breed_public_related_breeds(related_breed_id);
