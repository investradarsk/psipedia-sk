CREATE TABLE monetization_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  advertiser_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  start_at TEXT,
  end_at TEXT,
  creative_image_url TEXT,
  creative_alt TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL,
  body_copy TEXT NOT NULL DEFAULT '',
  destination_url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_affiliate INTEGER NOT NULL DEFAULT 0 CHECK (is_affiliate IN (0, 1)),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

CREATE TABLE monetization_campaign_placements (
  campaign_id TEXT NOT NULL REFERENCES monetization_campaigns(id) ON DELETE CASCADE,
  placement_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, placement_id)
);

CREATE TABLE monetization_promotions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  start_at TEXT,
  end_at TEXT,
  label TEXT NOT NULL DEFAULT 'Sponzorované',
  priority INTEGER NOT NULL DEFAULT 0,
  provenance TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

CREATE TABLE monetization_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  campaign_id TEXT NOT NULL REFERENCES monetization_campaigns(id) ON DELETE CASCADE,
  placement_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX monetization_campaign_status_window_idx
  ON monetization_campaigns(status, start_at, end_at, priority);

CREATE INDEX monetization_campaign_placement_lookup_idx
  ON monetization_campaign_placements(placement_id, campaign_id);

CREATE INDEX monetization_promotion_lookup_idx
  ON monetization_promotions(entity_type, entity_id, status, start_at, end_at, priority);

CREATE UNIQUE INDEX monetization_event_dedupe_idx
  ON monetization_events(event_type, campaign_id, placement_id, event_key);

CREATE INDEX monetization_event_reporting_idx
  ON monetization_events(campaign_id, placement_id, event_type, created_at);
