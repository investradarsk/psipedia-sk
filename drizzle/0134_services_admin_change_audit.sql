-- SERVICES V3 phase 3C — ADDITIVE audit ledger. NOT approved for production apply.
-- Depends on 0133 having been applied ONCE. Never reapply 0133.
-- Feature flags must remain OFF until 0134 is separately approved, applied and verified.
CREATE TABLE service_catalog_admin_change_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('option','choice')),
  operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','RESET','DELETE')),
  option_id TEXT NOT NULL,
  profile_id INTEGER,
  actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  prior_version INTEGER,
  next_version INTEGER,
  prior_json TEXT,
  next_json TEXT
);
CREATE INDEX service_catalog_admin_change_audit_entity_idx
  ON service_catalog_admin_change_audit(entity_type,option_id,profile_id,id);
CREATE TRIGGER service_catalog_admin_option_audit_insert
AFTER INSERT ON service_catalog_admin_options
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,actor,occurred_at,next_version,next_json)
  VALUES ('option','INSERT',NEW.id,NEW.created_by,NEW.created_at,NEW.version,
    json_object('label',NEW.label,'kind',NEW.kind,'category',NEW.primary_category,'group',NEW.group_name,
      'meaning',NEW.meaning,'status',NEW.status,'mirror',NEW.notion_mirror_status));
END;
CREATE TRIGGER service_catalog_admin_option_audit_update
AFTER UPDATE ON service_catalog_admin_options
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,actor,occurred_at,prior_version,next_version,prior_json,next_json)
  VALUES ('option','UPDATE',NEW.id,NEW.updated_by,NEW.updated_at,OLD.version,NEW.version,
    json_object('label',OLD.label,'kind',OLD.kind,'category',OLD.primary_category,'group',OLD.group_name,
      'meaning',OLD.meaning,'status',OLD.status,'mirror',OLD.notion_mirror_status),
    json_object('label',NEW.label,'kind',NEW.kind,'category',NEW.primary_category,'group',NEW.group_name,
      'meaning',NEW.meaning,'status',NEW.status,'mirror',NEW.notion_mirror_status));
END;
CREATE TRIGGER service_catalog_admin_choice_audit_insert
AFTER INSERT ON service_profile_option_choices
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,profile_id,actor,occurred_at,next_version,next_json)
  VALUES ('choice','INSERT',NEW.option_id,NEW.profile_id,NEW.created_by,NEW.created_at,NEW.version,
    json_object('choice',NEW.choice));
END;
CREATE TRIGGER service_catalog_admin_choice_audit_update
AFTER UPDATE ON service_profile_option_choices
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,profile_id,actor,occurred_at,prior_version,next_version,prior_json,next_json)
  VALUES ('choice','UPDATE',NEW.option_id,NEW.profile_id,NEW.updated_by,NEW.updated_at,OLD.version,NEW.version,
    json_object('choice',OLD.choice),json_object('choice',NEW.choice));
END;
-- RESET is intentionally logged by the D1 batch transaction with the authenticated
-- acting Admin, then CAS-deleted; a trigger cannot know the reset actor from OLD.

-- Record deletes not initiated by the explicit RESET endpoint as well. For a
-- RESET there are two events: its authenticated RESET intent and this physical
-- DELETE. Cascade/maintenance deletes have no verified human actor, so record
-- an explicit system marker instead of attributing them to OLD.updated_by.
-- Historical rows deliberately have no cascading FK to live profile/option rows.
CREATE TRIGGER service_catalog_admin_choice_audit_delete
AFTER DELETE ON service_profile_option_choices
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,profile_id,actor,occurred_at,prior_version,prior_json)
  VALUES ('choice','DELETE',OLD.option_id,OLD.profile_id,'system:db_delete',
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),OLD.version,json_object('choice',OLD.choice));
END;

-- The history must remain append-only even if another code path tries to edit
-- or purge an event. Database operators can still change schema; this is not
-- cryptographic immutability.
CREATE TRIGGER service_catalog_admin_audit_no_update
BEFORE UPDATE ON service_catalog_admin_change_audit
BEGIN
  SELECT RAISE(ABORT,'Services V3 audit history is append-only');
END;
CREATE TRIGGER service_catalog_admin_audit_no_delete
BEFORE DELETE ON service_catalog_admin_change_audit
BEGIN
  SELECT RAISE(ABORT,'Services V3 audit history is append-only');
END;

-- A SYNCED status alone is not evidence that Notion acknowledged these exact
-- canonical semantics. There is deliberately NO Admin HTTP writer for receipts.
-- A future trusted reconciler may insert a receipt only after independently
-- reading/confirming the remote Notion page and its version/content.
CREATE TABLE service_catalog_admin_notion_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_id TEXT NOT NULL REFERENCES service_catalog_admin_options(id) ON DELETE RESTRICT,
  option_version INTEGER NOT NULL CHECK(option_version>=1),
  notion_page_id TEXT NOT NULL CHECK(length(notion_page_id)>=3),
  notion_last_edited_at TEXT NOT NULL,
  remote_payload_sha256 TEXT NOT NULL CHECK(length(remote_payload_sha256)=64),
  verified_at TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  UNIQUE(option_id,option_version)
);
CREATE TRIGGER service_catalog_admin_receipt_no_update
BEFORE UPDATE ON service_catalog_admin_notion_receipts
BEGIN
  SELECT RAISE(ABORT,'Services V3 Notion receipts are append-only');
END;
CREATE TRIGGER service_catalog_admin_receipt_no_delete
BEFORE DELETE ON service_catalog_admin_notion_receipts
BEGIN
  SELECT RAISE(ABORT,'Services V3 Notion receipts are append-only');
END;
-- Enforce verified proof at the D1 boundary, not merely in a route. There
-- cannot be an ACTIVE promotion without a current-version receipt, even if a
-- future caller skips the application-level authorization check.
CREATE TRIGGER service_catalog_admin_option_approval_receipt
BEFORE UPDATE OF status ON service_catalog_admin_options
WHEN OLD.status='DRAFT' AND NEW.status='ACTIVE'
BEGIN
  SELECT RAISE(ABORT,'Notion receipt required before canonical approval')
  WHERE NOT EXISTS (
    SELECT 1 FROM service_catalog_admin_notion_receipts
    WHERE option_id=OLD.id AND option_version=OLD.version
  );
END;
