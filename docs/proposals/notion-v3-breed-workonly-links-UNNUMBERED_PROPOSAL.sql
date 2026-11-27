-- UNNUMBERED PROPOSAL. Do not apply without owner approval, D1 bookmark,
-- dependency/schema inventory and offline verification in one atomic transaction.
-- New work-only breeds have no historical Notion original; never fabricate one.
-- Refuse to rebuild if any deployed table has an incoming foreign key.
-- Do not disable foreign keys or rely on cascades during a schema migration.
SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) fk
 WHERE m.type='table' AND fk."table" IN ('breed_notion_workcopy_links')
) THEN 1 ELSE json_extract('V3_SCHEMA_INCOMING_FK','$') END;
DROP TRIGGER unified_scope_breed_notion_workcopy_links_insert;
DROP TRIGGER unified_scope_breed_notion_workcopy_links_delete;
DROP TRIGGER unified_scope_breed_notion_workcopy_links_update;
CREATE TABLE breed_notion_workcopy_links_v3_new (
  breed_id INTEGER PRIMARY KEY NOT NULL
    REFERENCES managed_breeds(id) ON DELETE CASCADE,
  original_notion_page_id TEXT UNIQUE,
  work_notion_page_id TEXT NOT NULL UNIQUE,
  original_data_source_id TEXT,
  work_data_source_id TEXT NOT NULL,
  canonical_slug TEXT NOT NULL,
  fci_number INTEGER CHECK (fci_number IS NULL OR fci_number > 0),
  original_sync_receipt TEXT,
  work_sync_receipt TEXT,
  work_last_synced_at TEXT,
  work_last_error_code TEXT,
  original_sync_last_synced_at TEXT,
  original_notion_last_edited_time TEXT,
  work_notion_last_edited_time TEXT,
  status TEXT NOT NULL DEFAULT 'SHADOW'
    CHECK (status IN ('SHADOW', 'VERIFIED', 'ACTIVE', 'ROLLED_BACK')),
  verified_at TEXT,
  activated_at TEXT,
  rolled_back_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (original_notion_page_id <> work_notion_page_id),
  CHECK (original_data_source_id <> work_data_source_id),
  CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (status <> 'VERIFIED' OR verified_at IS NOT NULL),
  CHECK ((original_notion_page_id IS NOT NULL AND original_data_source_id IS NOT NULL AND original_sync_receipt IS NOT NULL AND fci_number IS NOT NULL)
    OR (original_notion_page_id IS NULL AND original_data_source_id IS NULL AND original_sync_receipt IS NULL AND original_sync_last_synced_at IS NULL AND original_notion_last_edited_time IS NULL AND status='ACTIVE'))
);

INSERT INTO breed_notion_workcopy_links_v3_new (breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,work_last_synced_at,work_last_error_code,original_sync_last_synced_at,original_notion_last_edited_time,work_notion_last_edited_time,status,verified_at,activated_at,rolled_back_at,created_at,updated_at) SELECT breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,work_last_synced_at,work_last_error_code,original_sync_last_synced_at,original_notion_last_edited_time,work_notion_last_edited_time,status,verified_at,activated_at,rolled_back_at,created_at,updated_at FROM breed_notion_workcopy_links;
SELECT CASE WHEN (SELECT COUNT(*) FROM breed_notion_workcopy_links_v3_new)=(SELECT COUNT(*) FROM breed_notion_workcopy_links)
 AND NOT EXISTS(SELECT breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,work_last_synced_at,work_last_error_code,original_sync_last_synced_at,original_notion_last_edited_time,work_notion_last_edited_time,status,verified_at,activated_at,rolled_back_at,created_at,updated_at FROM breed_notion_workcopy_links EXCEPT SELECT breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,work_last_synced_at,work_last_error_code,original_sync_last_synced_at,original_notion_last_edited_time,work_notion_last_edited_time,status,verified_at,activated_at,rolled_back_at,created_at,updated_at FROM breed_notion_workcopy_links_v3_new)
 THEN 1 ELSE json_extract('BREED_LINK_COPY_MISMATCH','$') END;
DROP TABLE breed_notion_workcopy_links;
ALTER TABLE breed_notion_workcopy_links_v3_new RENAME TO breed_notion_workcopy_links;
CREATE INDEX IF NOT EXISTS idx_breed_notion_workcopy_status
  ON breed_notion_workcopy_links(status, updated_at);

CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_insert
AFTER INSERT ON breed_notion_workcopy_links
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('breeds',CAST(NEW.breed_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='breeds' AND entity_id=CAST(NEW.breed_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='breeds' AND entity_id=CAST(NEW.breed_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_delete
AFTER DELETE ON breed_notion_workcopy_links
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('breeds',CAST(OLD.breed_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='breeds' AND entity_id=CAST(OLD.breed_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='breeds' AND entity_id=CAST(OLD.breed_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_update
AFTER UPDATE OF breed_id,work_notion_page_id,status,work_data_source_id ON breed_notion_workcopy_links
WHEN OLD.breed_id IS NOT NEW.breed_id OR OLD.work_notion_page_id IS NOT NEW.work_notion_page_id OR OLD.status IS NOT NEW.status OR OLD.work_data_source_id IS NOT NEW.work_data_source_id
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('breeds',CAST(OLD.breed_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='breeds' AND entity_id=CAST(OLD.breed_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='breeds' AND entity_id=CAST(OLD.breed_id AS TEXT);
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('breeds',CAST(NEW.breed_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='breeds' AND entity_id=CAST(NEW.breed_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='breeds' AND entity_id=CAST(NEW.breed_id AS TEXT);
END;

-- Unknown mandatory draft numbers use 0 only while the profile is private.
-- Protect every publication route, including bulk and future Admin handlers.
CREATE TRIGGER breed_workonly_publish_requires_known_values
BEFORE UPDATE OF status ON managed_breeds
WHEN NEW.status='published' AND OLD.status<>'published'
 AND EXISTS(SELECT 1 FROM breed_notion_workcopy_links l WHERE l.breed_id=NEW.id AND l.original_notion_page_id IS NULL)
 AND (NEW.fci_group NOT BETWEEN 1 AND 10 OR NEW.energy NOT BETWEEN 1 AND 5
   OR NEW.trainability NOT BETWEEN 1 AND 5 OR NEW.family NOT BETWEEN 1 AND 5
   OR NEW.children NOT BETWEEN 1 AND 5 OR NEW.other_dogs NOT BETWEEN 1 AND 5
   OR NEW.apartment NOT BETWEEN 1 AND 5 OR NEW.grooming NOT BETWEEN 1 AND 5
   OR NEW.shedding NOT BETWEEN 1 AND 5 OR NEW.prey_drive NOT BETWEEN 1 AND 5
   OR EXISTS(SELECT 1 FROM breed_notion_workcopy_links l WHERE l.breed_id=NEW.id AND l.work_last_error_code='INBOUND_ID_PENDING'))
BEGIN SELECT RAISE(ABORT,'BREED_DRAFT_REQUIRED_VALUES'); END;
