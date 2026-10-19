-- SERVICES V3 phase 3C — ADDITIVE audit ledger. NOT approved for production apply.
-- Depends on 0133 having been applied ONCE. Never reapply 0133.
-- Feature flags must remain OFF until 0134 is separately approved, applied and verified.
CREATE TABLE service_catalog_admin_change_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('option','choice')),
  operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','RESET')),
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
