-- First-party sitewide aggregate pageviews work without consent/device storage.
-- Identified browser sessions/uniques remain opt-in. Prepared only.
-- Protected migration: NEVER apply automatically via merge/deployment.
-- Keep article_read_hourly and directory_profile_view_hourly untouched.
CREATE TABLE site_analytics_hourly (
  bucket_hour TEXT PRIMARY KEY NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0 CHECK(pageviews >= 0),
  sessions INTEGER NOT NULL DEFAULT 0 CHECK(sessions >= 0)
);

CREATE TABLE site_analytics_pages_hourly (
  bucket_hour TEXT NOT NULL,
  path TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0 CHECK(pageviews >= 0),
  PRIMARY KEY(bucket_hour, path)
);
CREATE INDEX site_analytics_pages_hourly_path_idx
  ON site_analytics_pages_hourly(path, bucket_hour);

CREATE TABLE site_analytics_sources_hourly (
  bucket_hour TEXT NOT NULL,
  source TEXT NOT NULL,
  device TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0 CHECK(pageviews >= 0),
  sessions INTEGER NOT NULL DEFAULT 0 CHECK(sessions >= 0),
  PRIMARY KEY(bucket_hour, source, device)
);

-- HMAC identifiers, not raw visitor IDs/IPs or browser fingerprints.
-- These tables have a <=35-day sliding retention, maintained on sampled writes.
CREATE TABLE site_analytics_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  visitor_hash TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  source TEXT NOT NULL,
  device TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX site_analytics_sessions_last_seen_idx
  ON site_analytics_sessions(last_seen);
CREATE INDEX site_analytics_sessions_expiry_idx
  ON site_analytics_sessions(expires_at);

CREATE TABLE site_analytics_visitors_daily (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(day, visitor_hash)
);
CREATE INDEX site_analytics_visitors_daily_seen_idx
  ON site_analytics_visitors_daily(last_seen, visitor_hash);
CREATE INDEX site_analytics_visitors_daily_expiry_idx
  ON site_analytics_visitors_daily(expires_at);

-- Reuse the existing HMAC-protected IP security limiter; never scan
-- or remove other application security buckets during retention.
CREATE INDEX site_analytics_security_rate_expiry_idx
  ON security_rate_limits(expires_at)
  WHERE bucket_key GLOB 'site-traffic-ip:*';
