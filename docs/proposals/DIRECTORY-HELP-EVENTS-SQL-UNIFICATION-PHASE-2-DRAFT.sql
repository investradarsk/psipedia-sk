-- PHASE 2 / 4 — SQL DESIGN PROPOSAL ONLY, NOT A PRODUCTION MIGRATION.
-- Deliberately stored under docs/proposals, outside drizzle/*.sql.
-- PR #1414 merged on 2026-11-18; migration index 0169 now exists on main.
-- Allocate a later free index after reviewing main and the real D1 state.
-- DO NOT execute this proposal against D1 yet.
--
-- Existing Help tables (help_cases, help_organizations, adoption_dogs,
-- lost_found_dog_reports), Events (managed_events), e-shops (managed_eshops)
-- and their Notion mappings are already canonical SQL and need NO duplicates.
-- This additive proposal only normalizes Directory fields still held in
-- source_data_json. Public/Admin reads remain unchanged until phase 3.
--
-- Semantics:
--   NULL column or ABSENT relation row = not yet migrated / no verified value.
--   '' (empty text) = explicitly cleared (must not revive legacy JSON).
--   No schema change attempts to import or delete source_data_json values.
--   Services V3 and breed/club relationships keep their current SQL owners.

ALTER TABLE directory_profiles ADD COLUMN public_phone TEXT;
ALTER TABLE directory_profiles ADD COLUMN public_email TEXT;
ALTER TABLE directory_profiles ADD COLUMN facebook_url TEXT;
ALTER TABLE directory_profiles ADD COLUMN instagram_url TEXT;

-- A profile's primary category remains directory_profiles.category.
-- This relation holds ONLY secondary membership; never clone a profile.
CREATE TABLE directory_profile_additional_categories (
  profile_id INTEGER NOT NULL
    REFERENCES directory_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'veterinari', 'treneri', 'kynologicke-kluby', 'chovatelske-kluby',
    'chovatelske-stanice', 'salony-a-sluzby', 'hotely-a-opatrovanie',
    'vencenie', 'fyzioterapia', 'dalsie-sluzby'
  )),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, category)
);
CREATE INDEX directory_profile_additional_categories_category_idx
  ON directory_profile_additional_categories(category, profile_id);

-- Only free-text public editorial facts belong here. Relation-owned breed,
-- club and Services V3 values must NOT be mirrored into this table.
-- field_key is a stable registry key, never arbitrary request SQL.
CREATE TABLE directory_profile_public_facts (
  profile_id INTEGER NOT NULL
    REFERENCES directory_profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL
    CHECK (length(field_key) BETWEEN 1 AND 100),
  value_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, field_key)
);
CREATE INDEX directory_profile_public_facts_key_idx
  ON directory_profile_public_facts(field_key, profile_id);

-- Category-specific Notion select filters (21 definitions across the
-- existing Directory Filter V1 registry); one value per profile/definition.
-- The application registry validates category, allowed values and field IDs.
CREATE TABLE directory_profile_filter_values (
  profile_id INTEGER NOT NULL
    REFERENCES directory_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'veterinari', 'treneri', 'kynologicke-kluby', 'chovatelske-kluby',
    'chovatelske-stanice', 'salony-a-sluzby', 'hotely-a-opatrovanie',
    'vencenie', 'fyzioterapia', 'dalsie-sluzby'
  )),
  filter_id TEXT NOT NULL CHECK (length(filter_id) BETWEEN 1 AND 100),
  value_text TEXT NOT NULL CHECK (length(value_text) BETWEEN 1 AND 100),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, filter_id)
);
CREATE INDEX directory_profile_filter_values_category_idx
  ON directory_profile_filter_values(category, filter_id, value_text, profile_id);
