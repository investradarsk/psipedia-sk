-- PREPARED ONLY: Facebook safe-retry metadata. No production APPLY.
-- Depends on 0130 attempt ledger and canonical sequential migration 0134.
-- The post_id primary key/atomic claim is intentionally preserved.
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 3);
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN retry_not_before TEXT;
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN outcome_kind TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK(outcome_kind IN ('UNKNOWN','PROVEN_REJECTED','AMBIGUOUS'));
CREATE INDEX facebook_image_publish_retry_idx
  ON facebook_image_publish_attempts(outcome_kind,retry_not_before,post_id);
