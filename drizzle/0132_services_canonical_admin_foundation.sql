-- SERVICES V3 phase 2. Additive schema ONLY; not auto-applied to production.
-- Canonical new options are DRAFT until Admin approves a later mirror-gated rollout.
CREATE TABLE service_catalog_admin_options (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('service','attribute')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 3 AND 100),
  normalized_label TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  meaning TEXT NOT NULL,
  primary_category TEXT NOT NULL,
  categories_json TEXT NOT NULL CHECK (json_valid(categories_json) AND json_type(categories_json)='array'),
  value_kind TEXT NOT NULL CHECK (value_kind='tri_state'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  notion_mirror_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (notion_mirror_status IN ('PENDING','SYNCED','CONFLICT')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK ((kind='service' AND id LIKE 'svc.admin.%') OR (kind='attribute' AND id LIKE 'attr.admin.%'))
);
CREATE INDEX service_catalog_admin_options_status_idx
  ON service_catalog_admin_options(status,kind,primary_category,id);
CREATE INDEX service_catalog_admin_options_mirror_idx
  ON service_catalog_admin_options(notion_mirror_status,id);

-- No row = unknown. Only explicitly chosen yes/no values are stored.
CREATE TABLE service_profile_option_choices (
  profile_id INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('yes','no')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id,option_id),
  FOREIGN KEY (profile_id) REFERENCES directory_profiles(id) ON DELETE CASCADE
);
CREATE INDEX service_profile_option_choices_option_idx
  ON service_profile_option_choices(option_id,choice,profile_id);

-- Separate prepared storage for nonbinary canonical properties, not yet activated.
CREATE TABLE service_profile_property_values (
  profile_id INTEGER NOT NULL,
  property_id TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (profile_id,property_id),
  FOREIGN KEY (profile_id) REFERENCES directory_profiles(id) ON DELETE CASCADE
);
