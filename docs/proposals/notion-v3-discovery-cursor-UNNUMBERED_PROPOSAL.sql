-- Technical checkpoint only. Number/apply after main integration and owner approval.
-- Separate from the field recovery cursor so an older worker cannot claim a
-- discovery row as an editable field. No canonical content or new cron.
CREATE TABLE IF NOT EXISTS notion_discovery_cursor (
  agenda TEXT NOT NULL CHECK (agenda IN ('directory','eshops','breeds','articles')),
  source_id TEXT NOT NULL,
  next_cursor TEXT,
  lease_until INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agenda,source_id)
);
