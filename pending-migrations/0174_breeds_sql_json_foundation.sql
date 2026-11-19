-- 0174: Plemená SQL/JSON canonical foundation (additive, no data migration).
-- Reserved: 0171/0172 partner PR #1437; 0173 directory PR #1451.
-- STAGED in pending-migrations until 0171-0173 land in drizzle in order.
-- No DROP/DELETE/UPDATE/INSERT; no backfill or public/Admin/Notion switch.
-- This file must not be executed against production until the prerequisite
-- migrations, actual D1 schema, production backup and owner approval are verified.
-- NULL means "not yet migrated"; '' / 0 represent explicitly supplied values.

ALTER TABLE managed_breeds ADD COLUMN seo_title TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_description TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_focus_keyword TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_canonical_url TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_og_title TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_og_description TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_og_image TEXT;
--> statement-breakpoint
ALTER TABLE managed_breeds ADD COLUMN seo_noindex INTEGER CHECK (seo_noindex IN (0,1));
--> statement-breakpoint
-- 33 independently editable FCI cells; no duplicate public master.
CREATE TABLE breed_fci_standard (
  breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  fci_status_fci TEXT,
  fci_historicky_suhrn TEXT,
  fci_celkovy_vzhlad TEXT,
  fci_dolezite_proporcie TEXT,
  fci_povaha_temperament TEXT,
  fci_hlava_lebecna_cast TEXT,
  fci_hlava_tvarova_cast TEXT,
  fci_oci TEXT,
  fci_usi TEXT,
  fci_krk TEXT,
  fci_telo TEXT,
  fci_chvost TEXT,
  fci_predne_koncatiny TEXT,
  fci_zadne_koncatiny TEXT,
  fci_pohyb TEXT,
  fci_koza TEXT,
  fci_srst TEXT,
  fci_farba TEXT,
  fci_vyska_pes_cm TEXT,
  fci_vyska_suka_cm TEXT,
  fci_hmotnost_pes_kg TEXT,
  fci_hmotnost_suka_kg TEXT,
  fci_velkost_hmotnost_poznamka TEXT,
  fci_chyby TEXT,
  fci_zavazne_chyby TEXT,
  fci_diskvalifikacne_chyby TEXT,
  fci_poznamka_chov TEXT,
  fci_vyuzitie TEXT,
  fci_fci_skupina_nazov TEXT,
  fci_fci_sekcia_nazov TEXT,
  fci_zdroj_poznamka TEXT,
  fci_fci_nomenklatura_url TEXT,
  fci_fci_standard_pdf TEXT
);
--> statement-breakpoint
-- Six editorial cells; scalar intro/history/exercise/etc stay in managed_breeds.
CREATE TABLE breed_editorial_text (
  breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  overview TEXT,
  coat_care TEXT,
  family_life TEXT,
  other_dogs_life TEXT,
  curiosities TEXT,
  common_owner_mistakes TEXT,
  -- Existing editor-only historical content must survive removal of editorial_json.
  exercise_tip TEXT,
  training_tip TEXT,
  health_tip TEXT,
  coat_tip TEXT,
  hero_traits_json TEXT CHECK (
    hero_traits_json IS NULL OR
    CASE WHEN json_valid(hero_traits_json)
      THEN json_type(hero_traits_json)='array' ELSE 0 END
  )
);
--> statement-breakpoint
-- Six numeric controlled facts and 3 multi-select JSON lists.
-- Null = unknown/not copied; [] = explicitly selected nothing.
CREATE TABLE breed_public_facts (
  breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  height_min_cm REAL,
  height_max_cm REAL,
  weight_min_kg REAL,
  weight_max_kg REAL,
  lifespan_min_years REAL,
  lifespan_max_years REAL,
  origin_countries_json TEXT CHECK (origin_countries_json IS NULL OR CASE WHEN json_valid(origin_countries_json) THEN json_type(origin_countries_json)='array' ELSE 0 END),
  coat_types_json TEXT CHECK (coat_types_json IS NULL OR CASE WHEN json_valid(coat_types_json) THEN json_type(coat_types_json)='array' ELSE 0 END),
  use_types_json TEXT CHECK (use_types_json IS NULL OR CASE WHEN json_valid(use_types_json) THEN json_type(use_types_json)='array' ELSE 0 END)
);
--> statement-breakpoint
-- Relation owned by SQL: 6 current edges will be copied only at later cutover.
-- Invariant: no duplicate related breed, no self-reference, stable 0-based order.
CREATE TABLE breed_related_breeds (
  breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  related_breed_id INTEGER NOT NULL REFERENCES managed_breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (breed_id, related_breed_id),
  UNIQUE (breed_id, position),
  CHECK (breed_id <> related_breed_id)
);
--> statement-breakpoint
CREATE INDEX breed_related_breeds_target_idx
  ON breed_related_breeds(related_breed_id, breed_id);
