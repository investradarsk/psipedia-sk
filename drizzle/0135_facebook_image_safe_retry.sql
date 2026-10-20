-- PREPARED ONLY: Facebook safe-retry metadata and append-only supersession audit.
-- Depends on canonical preceding 0134. No production APPLY.
-- Existing post_id primary key/atomic claim and published/ambiguous ledger are retained.
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 3);
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN retry_not_before TEXT;
ALTER TABLE facebook_image_publish_attempts
  ADD COLUMN outcome_kind TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK(outcome_kind IN ('UNKNOWN','PROVEN_REJECTED','AMBIGUOUS','SUPERSEDED'));
CREATE INDEX facebook_image_publish_retry_idx
  ON facebook_image_publish_attempts(outcome_kind,retry_not_before,post_id);

-- Completed explicit Meta rejections can be cancelled/rescheduled ONLY with
-- a durable record of the previous attempt; uncertain external outcomes cannot.
CREATE TABLE facebook_image_publish_attempt_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES facebook_image_posts(id) ON DELETE RESTRICT,
  snapshot_version INTEGER NOT NULL,
  state TEXT NOT NULL,
  outcome_kind TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  recorded_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('CONTENT_SUPERSEDED','RECLAIMED'))
);
CREATE INDEX facebook_image_publish_attempt_history_post_idx
  ON facebook_image_publish_attempt_history(post_id,id);
CREATE TRIGGER facebook_image_retry_history_immutable_update
  BEFORE UPDATE ON facebook_image_publish_attempt_history
BEGIN
  SELECT RAISE(ABORT,'Facebook retry history is append-only');
END;
CREATE TRIGGER facebook_image_retry_history_immutable_delete
  BEFORE DELETE ON facebook_image_publish_attempt_history
BEGIN
  SELECT RAISE(ABORT,'Facebook retry history is append-only');
END;
-- Runs in the SAME SQLite statement/transaction as the canonical post edit.
-- If a competing publisher already claimed the retry, the update is denied
-- by the caller's guarded UPDATE and this trigger cannot supersede SENDING.
CREATE TRIGGER facebook_image_retry_supersede_post_update
  AFTER UPDATE OF version ON facebook_image_posts
  WHEN NEW.version<>OLD.version
    AND EXISTS (
      SELECT 1 FROM facebook_image_publish_attempts a
      WHERE a.post_id=NEW.id AND a.state='UNCERTAIN'
        AND a.outcome_kind='PROVEN_REJECTED')
BEGIN
  INSERT INTO facebook_image_publish_attempt_history
    (post_id,snapshot_version,state,outcome_kind,retry_count,started_at,
     completed_at,error_code,recorded_at,reason)
  SELECT post_id,snapshot_version,state,outcome_kind,retry_count,started_at,
         completed_at,error_code,NEW.updated_at,'CONTENT_SUPERSEDED'
    FROM facebook_image_publish_attempts
    WHERE post_id=NEW.id AND state='UNCERTAIN'
      AND outcome_kind='PROVEN_REJECTED';
  UPDATE facebook_image_publish_attempts
    SET outcome_kind='SUPERSEDED',retry_not_before=NULL,error_code='RETRY_SUPERSEDED'
    WHERE post_id=NEW.id AND state='UNCERTAIN'
      AND outcome_kind='PROVEN_REJECTED';
END;

-- A later legitimate new schedule can reuse the canonical post_id only after
-- archiving the superseded attempt, never by deleting a historical attempt.
CREATE TRIGGER facebook_image_retry_audit_reclaim
  BEFORE UPDATE OF snapshot_version,state ON facebook_image_publish_attempts
  WHEN OLD.outcome_kind='SUPERSEDED' AND OLD.state='UNCERTAIN'
       AND NEW.state='SENDING'
BEGIN
  INSERT INTO facebook_image_publish_attempt_history
    (post_id,snapshot_version,state,outcome_kind,retry_count,started_at,
     completed_at,error_code,recorded_at,reason)
  VALUES(OLD.post_id,OLD.snapshot_version,OLD.state,OLD.outcome_kind,
    OLD.retry_count,OLD.started_at,OLD.completed_at,OLD.error_code,
    NEW.started_at,'RECLAIMED');
END;
