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

-- A failed CAS must abort the entire D1 batch, not commit only the first UPDATE.
-- The AFTER-UPDATE state and immutable history entry either both commit or neither.
CREATE TRIGGER media_review_decision_finalization_guard
BEFORE INSERT ON media_source_review_decisions
BEGIN
  SELECT RAISE(ABORT, 'MEDIA_REVIEW_INCOMPLETE_DECISION')
  WHERE NOT EXISTS (
    SELECT 1 FROM media_source_monitors m
    WHERE m.id=NEW.monitor_id AND m.entity_type=NEW.entity_type
      AND m.entity_id=NEW.entity_id
      AND m.review_claim_token IS NULL AND m.candidate_image_key IS NULL
      AND m.updated_at=NEW.decided_at
      AND (
        (NEW.action='reject' AND m.status='UNTRACKED')
        OR
        (NEW.action='accept' AND m.status='OK' AND m.active_image_key IS NOT NULL
          AND (
            (NEW.entity_type='DIRECTORY_PROFILE' AND EXISTS (
              SELECT 1 FROM directory_profiles p WHERE p.id=NEW.entity_id AND p.image_key=m.active_image_key
            ))
            OR
            (NEW.entity_type='MANAGED_EVENT' AND EXISTS (
              SELECT 1 FROM managed_events e WHERE e.id=NEW.entity_id AND e.image_key=m.active_image_key
            ))
          )
        )
      )
  );
END;

CREATE TRIGGER media_review_decisions_no_update
BEFORE UPDATE ON media_source_review_decisions
BEGIN SELECT RAISE(ABORT, 'MEDIA_REVIEW_AUDIT_IMMUTABLE'); END;

CREATE TRIGGER media_review_decisions_no_delete
BEFORE DELETE ON media_source_review_decisions
BEGIN SELECT RAISE(ABORT, 'MEDIA_REVIEW_AUDIT_IMMUTABLE'); END;
