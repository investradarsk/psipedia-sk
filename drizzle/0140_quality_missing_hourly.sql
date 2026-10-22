-- Quality of data: hourly missing-field research for existing canonical records.
-- Independent queue and scan cursors; leaves Maps/Tools and existing automations unchanged.
CREATE TABLE IF NOT EXISTS quality_missing_scans (
  area TEXT NOT NULL CHECK(area IN ('services','events','help')),
  hour TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  scanned_at TEXT NOT NULL,
  PRIMARY KEY(area,hour)
);
CREATE INDEX IF NOT EXISTS quality_missing_scans_month ON quality_missing_scans(scanned_at,area);
CREATE TABLE IF NOT EXISTS quality_missing_cursors (
  area TEXT PRIMARY KEY CHECK(area IN ('services','events','help')),
  type_index INTEGER NOT NULL DEFAULT 0,
  entity_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO quality_missing_cursors(area,type_index,entity_id,updated_at)
  VALUES ('services',0,0,''),('events',0,0,''),('help',0,0,'');
CREATE TABLE IF NOT EXISTS quality_missing_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL CHECK(area IN ('services','events','help')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('DIRECTORY','EVENT','ORGANIZATION','ADOPTION','FOSTER','HELP_ITEM','LOST_FOUND')),
  entity_id INTEGER NOT NULL,
  profile_label TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_group TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACCEPTED','REJECTED')),
  found_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  UNIQUE(entity_type,entity_id,field_key,value)
);
CREATE INDEX IF NOT EXISTS quality_missing_proposals_pending ON quality_missing_proposals(status,area,field_group,id);