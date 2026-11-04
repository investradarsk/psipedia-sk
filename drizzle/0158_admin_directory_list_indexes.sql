-- 0158: Additive indexes for large admin directory lists.
-- Read-only queries and writes retain existing semantics. Apply via the
-- approved D1 migration procedure; merging the PR does not apply this SQL.
CREATE INDEX IF NOT EXISTS directory_profiles_admin_updated_idx
  ON directory_profiles(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS directory_profiles_admin_category_updated_idx
  ON directory_profiles(category, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS directory_profiles_admin_status_updated_idx
  ON directory_profiles(status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS directory_profiles_admin_name_idx
  ON directory_profiles(name COLLATE NOCASE ASC, id ASC);

CREATE INDEX IF NOT EXISTS directory_profiles_admin_city_name_idx
  ON directory_profiles(city COLLATE NOCASE ASC, name COLLATE NOCASE ASC, id ASC);
