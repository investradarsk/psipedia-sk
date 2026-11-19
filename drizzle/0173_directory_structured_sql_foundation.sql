-- 0173: Additive, schema-only Directory relational storage foundation.
-- Reserved sequence: 0171 and 0172 belong to partner PR #1437.
-- DO NOT dispatch 0173 before verifying 0171/0172 migration ownership,
-- deployed schema and D1 migration ledger; generic Wrangler migrations
-- must NOT be used to replay any uncertain production migration history.
--
-- No data copy, no DELETE, no DROP, no change to Admin/Notion/public readers,
-- no triggers and no production write on PR merge.
-- profile_id references the existing directory_profiles(id).

-- Ordered, freely editable qualifications: no duplicated list in JSON.
CREATE TABLE directory_profile_qualifications (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL CHECK (item_order >= 0),
  qualification_text TEXT NOT NULL CHECK (length(trim(qualification_text)) > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, item_order)
);
--> statement-breakpoint
CREATE INDEX directory_profile_qualifications_profile_idx
  ON directory_profile_qualifications(profile_id, item_order);
--> statement-breakpoint

-- Day 1=Monday ... 7=Sunday; day 0 is a free-text exceptional note.
-- hours_text deliberately accepts split shifts, appointment-only and holidays;
-- no guessing/normalization of historical prose.
CREATE TABLE directory_profile_opening_hours (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 7),
  hours_text TEXT NOT NULL CHECK (length(trim(hours_text)) > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, day_of_week)
);
--> statement-breakpoint
CREATE INDEX directory_profile_opening_hours_profile_idx
  ON directory_profile_opening_hours(profile_id, day_of_week);
--> statement-breakpoint

-- Gallery records only. The main image remains the SQL-owned
-- directory_profiles.image_url / image_key. The asset bytes live in R2.
CREATE TABLE directory_profile_media (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL CHECK (item_order >= 0),
  image_url TEXT,
  image_key TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  attribution_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, item_order),
  CHECK (
    length(trim(COALESCE(image_url, ''))) > 0 OR
    length(trim(COALESCE(image_key, ''))) > 0
  )
);
--> statement-breakpoint
CREATE INDEX directory_profile_media_profile_idx
  ON directory_profile_media(profile_id, item_order);
--> statement-breakpoint

-- One SQL owner for independently editable SEO/OG properties.
CREATE TABLE directory_profile_seo (
  profile_id INTEGER PRIMARY KEY NOT NULL
    REFERENCES directory_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  focus_keyword TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  og_title TEXT NOT NULL DEFAULT '',
  og_description TEXT NOT NULL DEFAULT '',
  og_image_url TEXT NOT NULL DEFAULT '',
  noindex INTEGER NOT NULL DEFAULT 0 CHECK (noindex IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
--> statement-breakpoint

-- The reviewed lock and unlock-pending flag need SQL ownership BEFORE the
-- historical source_data_json lock can ever be removed. No lock is changed.
CREATE TABLE directory_profile_review_state (
  profile_id INTEGER PRIMARY KEY NOT NULL
    REFERENCES directory_profiles(id) ON DELETE CASCADE,
  reviewed_at TEXT,
  reviewed_by TEXT,
  unlock_pending INTEGER NOT NULL DEFAULT 0 CHECK (unlock_pending IN (0,1)),
  unlock_requested_at TEXT,
  unlock_requested_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX directory_profile_review_state_locked_idx
  ON directory_profile_review_state(unlock_pending, reviewed_at);
--> statement-breakpoint

-- Independent resolution record for each quality field.
-- Missing row = no saved resolution; never mirror to source_data_json.
CREATE TABLE directory_profile_quality_resolutions (
  profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,
  quality_field TEXT NOT NULL CHECK (quality_field IN (
    'phone','email','website','image','address'
  )),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN (
    'DOES_NOT_EXIST','NOT_PUBLIC','NOT_APPLICABLE','NOT_FOUND'
  )),
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id, quality_field)
);
--> statement-breakpoint
CREATE INDEX directory_profile_quality_resolutions_checked_idx
  ON directory_profile_quality_resolutions(quality_field, checked_at);
