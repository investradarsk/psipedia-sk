-- 0170: Add canonical SQL slots for Directory public contacts, secondary categories,
-- editorial facts and category filters. Owner-dispatched ONLY after a protected
-- production D1 schema preflight. This migration intentionally does NOT backfill
-- JSON, edit Notion, change public reads, delete data, or touch Help/Events.
--
-- CRITICAL: 0163–0169 schema is physically present in production with a
-- non-contiguous migration ledger. DO NOT use generic Wrangler migrations apply
-- for 0170 until a separate guarded rollout explicitly verifies this history.
-- NULL contact = not yet migrated; '' = explicitly cleared.
-- Missing relation row = no confirmed canonical value.

ALTER TABLE directory_profiles ADD COLUMN public_phone TEXT;
--> statement-breakpoint
ALTER TABLE directory_profiles ADD COLUMN public_email TEXT;
--> statement-breakpoint
ALTER TABLE directory_profiles ADD COLUMN facebook_url TEXT;
--> statement-breakpoint
ALTER TABLE directory_profiles ADD COLUMN instagram_url TEXT;
--> statement-breakpoint

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
--> statement-breakpoint
CREATE INDEX directory_profile_additional_categories_category_idx
  ON directory_profile_additional_categories(category, profile_id);
--> statement-breakpoint

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
--> statement-breakpoint
CREATE INDEX directory_profile_public_facts_key_idx
  ON directory_profile_public_facts(field_key, profile_id);
--> statement-breakpoint

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
--> statement-breakpoint
CREATE INDEX directory_profile_filter_values_category_idx
  ON directory_profile_filter_values(category, filter_id, value_text, profile_id);
