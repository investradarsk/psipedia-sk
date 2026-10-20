-- Image review V2: fail-closed candidate CAS and immutable admin decision history.
-- Apply only through the approved production migration procedure; never on merge.
ALTER TABLE media_source_monitors ADD COLUMN review_claim_token TEXT;
ALTER TABLE media_source_monitors ADD COLUMN review_claimed_at TEXT;

CREATE TABLE IF NOT EXISTS media_source_review_decisions (
  id TEXT PRIMARY KEY,
  monitor_id INTEGER NOT NULL REFERENCES media_source_monitors(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('DIRECTORY_PROFILE','MANAGED_EVENT')),
  entity_id INTEGER NOT NULL CHECK(entity_id > 0),
  candidate_image_key TEXT NOT NULL,
  candidate_image_url TEXT NOT NULL,
  candidate_content_hash TEXT,
  action TEXT NOT NULL CHECK(action IN ('accept','reject')),
  reason TEXT CHECK(reason IS NULL OR length(reason) <= 500),
  actor_ref TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED'))
);

CREATE INDEX IF NOT EXISTS media_review_decisions_monitor_time_idx
  ON media_source_review_decisions(monitor_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS media_review_claims_idx
  ON media_source_monitors(review_claim_token, review_claimed_at);
