-- Psipedia: anonymous pageview counts only. No visitor data, cookies or sessions.
-- Prepared, not active: never run automatically via PR merge or deploy.
-- The existing qualified article/profile migrations are unchanged.

CREATE TABLE site_analytics_hourly (
  bucket_hour TEXT PRIMARY KEY NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0 CHECK (pageviews >= 0)
);

CREATE TABLE site_analytics_pages_hourly (
  bucket_hour TEXT NOT NULL,
  path TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0 CHECK (pageviews >= 0),
  PRIMARY KEY (bucket_hour, path)
);
