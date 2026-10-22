-- SERVICES V3 0139 — durable once-per-option-version cron intent journal.
-- PREPARED ONLY: never apply to production without explicit owner approval.
-- Additive after 0138; 0133/0134 are not re-applied.
-- D1 stays canonical. The scheduler cannot repeat an uncertain Notion POST/PATCH.
CREATE TABLE service_catalog_notion_auto_attempts (
  option_id TEXT NOT NULL,
  option_version INTEGER NOT NULL CHECK(option_version>=1),
  action TEXT NOT NULL CHECK(action IN ('PROVISION_ONE','MIRROR_ONE')),
  claimed_at TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'CLAIMED'
    CHECK(outcome IN ('CLAIMED','CREATED_NEEDS_MIRROR','EXISTS','VERIFIED','RETRY','REVIEW','BLOCKED')),
  finished_at TEXT,
  PRIMARY KEY (option_id,option_version,action),
  CHECK((outcome='CLAIMED' AND finished_at IS NULL)
     OR (outcome<>'CLAIMED' AND finished_at IS NOT NULL))
);
CREATE INDEX service_catalog_notion_auto_attempts_claimed_idx
  ON service_catalog_notion_auto_attempts(claimed_at);
-- A claim can be resolved only once; neither identity nor provenance can be rewritten.
CREATE TRIGGER service_catalog_notion_auto_attempt_update_guard
BEFORE UPDATE ON service_catalog_notion_auto_attempts
WHEN OLD.outcome<>'CLAIMED' OR OLD.finished_at IS NOT NULL
 OR NEW.option_id<>OLD.option_id OR NEW.option_version<>OLD.option_version
 OR NEW.action<>OLD.action OR NEW.claimed_at<>OLD.claimed_at
 OR NEW.outcome='CLAIMED' OR NEW.finished_at IS NULL
BEGIN
  SELECT RAISE(ABORT,'Services V3 auto attempt cannot be rewritten');
END;
CREATE TRIGGER service_catalog_notion_auto_attempt_no_delete
BEFORE DELETE ON service_catalog_notion_auto_attempts
BEGIN
  SELECT RAISE(ABORT,'Services V3 auto attempt history is durable');
END;
