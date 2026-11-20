-- 0176: Adresár – complete SQL destination for Admin values without new JSON blobs.
-- STEP 1/4 ONLY: schema, no data transfer, no runtime cutover, no deletes.
-- 0175 is reserved by the separate Breeds SQL-only cleanup; never reuse it.
-- Existing profile scalar, contact, SEO, category, fact, filter, qualification,
-- gallery, review, quality and relation tables stay authoritative.
-- Extra fields capture only Admin/source values WITHOUT a canonical SQL owner.
--
-- Deliberate NULL/text/number distinction: an explicit empty string and null
-- must not be mistaken for an un-migrated value. Field value itself is scalar.
CREATE TABLE directory_profile_extra_fields (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 200),
  value_kind TEXT NOT NULL CHECK (value_kind IN ('text','number','null')),
  text_value TEXT,
  number_value REAL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, field_key),
  CHECK (
    (value_kind='text' AND text_value IS NOT NULL AND number_value IS NULL) OR
    (value_kind='number' AND text_value IS NULL AND number_value IS NOT NULL) OR
    (value_kind='null' AND text_value IS NULL AND number_value IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX directory_profile_extra_fields_key_idx
  ON directory_profile_extra_fields(field_key, profile_id);
--> statement-breakpoint

-- A list has its own row even when its selection is an explicit [].
-- Without this receipt, a deliberate clear could be confused with a missing
-- SQL migration and a newer Notion edit might incorrectly resurrect values.
CREATE TABLE directory_profile_extra_list_state (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 200),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, field_key)
);
--> statement-breakpoint

-- Historic array-valued metadata (e.g. legacy linked IDs) must not be
-- stored as JSON strings in the scalar table after cutover. Ordered atomic
-- text items live here until they can be mapped to existing canonical relations.
CREATE TABLE directory_profile_extra_list_items (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 200),
  item_order INTEGER NOT NULL CHECK (item_order >= 0),
  item_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, field_key, item_order)
);
--> statement-breakpoint
CREATE INDEX directory_profile_extra_list_items_key_idx
  ON directory_profile_extra_list_items(field_key, profile_id, item_order);
--> statement-breakpoint

-- Preserve the existing editable, free-text services_json without conflating
-- it with the distinct Services V3 selection relation.
CREATE TABLE directory_profile_service_texts (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL CHECK (item_order >= 0),
  service_text TEXT NOT NULL CHECK (length(trim(service_text)) > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, item_order)
);
--> statement-breakpoint

-- Thumbnail/detail image presentation: replace both historical *_display_json
-- columns with four independently typed values. NULL row = default display.
CREATE TABLE directory_profile_image_display_settings (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  display_context TEXT NOT NULL CHECK (display_context IN ('thumbnail','detail')),
  display_mode TEXT NOT NULL CHECK (
    (display_context='thumbnail' AND display_mode IN ('auto','crop','blur')) OR
    (display_context='detail' AND display_mode IN ('natural','crop','blur'))
  ),
  focus_x REAL NOT NULL CHECK (focus_x BETWEEN 0 AND 100),
  focus_y REAL NOT NULL CHECK (focus_y BETWEEN 0 AND 100),
  zoom REAL NOT NULL CHECK (zoom BETWEEN 1 AND 2.5),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, display_context)
);
--> statement-breakpoint

-- Per-profile migration receipt; SQL_ONLY is never inferred from an empty
-- old JSON or a successful PR. Steps 2–4 will require a verified receipt.
CREATE TABLE directory_profile_sql_cutover_state (
  profile_id INTEGER PRIMARY KEY NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('STAGED','VERIFIED','SQL_ONLY')),
  source_revision TEXT NOT NULL,
  notion_revision TEXT,
  staged_fields INTEGER NOT NULL CHECK (staged_fields >= 0),
  staged_lists INTEGER NOT NULL CHECK (staged_lists >= 0),
  verified_at TEXT,
  cutover_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (state='STAGED' AND verified_at IS NULL AND cutover_at IS NULL) OR
    (state='VERIFIED' AND verified_at IS NOT NULL AND cutover_at IS NULL) OR
    (state='SQL_ONLY' AND verified_at IS NOT NULL AND cutover_at IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX directory_profile_sql_cutover_state_state_idx
  ON directory_profile_sql_cutover_state(state, profile_id);
