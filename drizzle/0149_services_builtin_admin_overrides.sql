-- SERVICES V3: editable original (code-defined) catalog metadata.
-- Additive only; apply with the reviewed migration process before deploying UI/API.
-- Canonical built-in IDs and existing profile choices remain unchanged.
-- D1 overrides only display metadata/categories; they do not rewrite the static
-- definitions or claim that the Notion mirror has been reconciled.
CREATE TABLE service_catalog_builtin_overrides (
  option_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 3 AND 100),
  normalized_label TEXT NOT NULL UNIQUE,
  categories_json TEXT NOT NULL CHECK(json_valid(categories_json) AND json_type(categories_json)='array'),
  group_name TEXT NOT NULL CHECK(length(group_name) BETWEEN 2 AND 80),
  meaning TEXT NOT NULL CHECK(length(meaning) BETWEEN 10 AND 500),
  version INTEGER NOT NULL CHECK(version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (
    (option_id LIKE 'svc.%' AND option_id NOT LIKE 'svc.admin.%') OR
    (option_id LIKE 'attr.%' AND option_id NOT LIKE 'attr.admin.%')
  )
);
CREATE INDEX service_catalog_builtin_overrides_updated_idx
  ON service_catalog_builtin_overrides(updated_at,option_id);

-- Reuse the existing append-only Services V3 ledger (migration 0134).
CREATE TRIGGER service_catalog_builtin_override_audit_insert
AFTER INSERT ON service_catalog_builtin_overrides
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,actor,occurred_at,next_version,next_json)
  VALUES ('option','INSERT',NEW.option_id,NEW.created_by,NEW.created_at,NEW.version,
    json_object('label',NEW.label,'categories',json(NEW.categories_json),
      'group',NEW.group_name,'meaning',NEW.meaning,'source','built_in_override'));
END;
CREATE TRIGGER service_catalog_builtin_override_audit_update
AFTER UPDATE ON service_catalog_builtin_overrides
BEGIN
  INSERT INTO service_catalog_admin_change_audit
    (entity_type,operation,option_id,actor,occurred_at,prior_version,next_version,prior_json,next_json)
  VALUES ('option','UPDATE',NEW.option_id,NEW.updated_by,NEW.updated_at,OLD.version,NEW.version,
    json_object('label',OLD.label,'categories',json(OLD.categories_json),
      'group',OLD.group_name,'meaning',OLD.meaning,'source','built_in_override'),
    json_object('label',NEW.label,'categories',json(NEW.categories_json),
      'group',NEW.group_name,'meaning',NEW.meaning,'source','built_in_override'));
END;
-- Neither the stable option ID nor its original provenance can be rewritten.
CREATE TRIGGER service_catalog_builtin_override_identity_guard
BEFORE UPDATE ON service_catalog_builtin_overrides
WHEN NEW.option_id<>OLD.option_id OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by
BEGIN
  SELECT RAISE(ABORT,'Built-in canonical identity is immutable');
END;
CREATE TRIGGER service_catalog_builtin_override_no_delete
BEFORE DELETE ON service_catalog_builtin_overrides
BEGIN
  SELECT RAISE(ABORT,'Built-in catalog overrides cannot be deleted');
END;
