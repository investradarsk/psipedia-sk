-- Step 2/8: additive, owner-dispatched analytics foundation.
-- Never execute on production on merge; apply only via protected migration workflow.
-- Existing article_read_hourly and all historic article counts remain untouched.
CREATE TABLE directory_profile_view_hourly (
  profile_id INTEGER NOT NULL,
  bucket_hour TEXT NOT NULL,
  qualified_views INTEGER NOT NULL DEFAULT 0 CHECK (qualified_views >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, bucket_hour),
  FOREIGN KEY (profile_id) REFERENCES directory_profiles(id) ON DELETE CASCADE
);

CREATE INDEX directory_profile_view_hourly_window_idx
  ON directory_profile_view_hourly(bucket_hour, profile_id, qualified_views);

-- Shared read-only stream: no duplicated article writes or historical backfill.
CREATE VIEW content_qualified_views_hourly AS
  SELECT 'ARTICLE' AS entity_type, article_id AS entity_id,
    bucket_hour, qualified_reads AS qualified_views
  FROM article_read_hourly
  UNION ALL
  SELECT 'DIRECTORY_PROFILE' AS entity_type, profile_id AS entity_id,
    bucket_hour, qualified_views
  FROM directory_profile_view_hourly;

-- Expiration-only partial index for analytics keys stored in the existing
-- security limiter. Other features' security buckets are not modified.
CREATE INDEX profile_view_rate_expiry_idx
  ON security_rate_limits(expires_at)
  WHERE bucket_key GLOB 'public-profile-view-*';
