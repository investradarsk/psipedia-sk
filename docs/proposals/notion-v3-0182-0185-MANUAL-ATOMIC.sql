-- MANUAL SQL BUNDLE 0182–0185. Execute ONLY in a verified atomic D1 batch.
-- Owner approval, quiescent relevant writers, fresh Time Travel bookmark required.
-- Dashboard atomicity must be verified before attempting this bundle.
-- Never execute portions separately, retry blindly, or replay historical migrations.
-- Source pins: 316a510f468fba7237cf9a77fd7d7ad1588bf7dc, 9c7fba54d60ba6c5bc80cbd043a5cc714bca396f, 5f430174a02be6fc3e53d2e83aab52d419b92fda, 4d16ee07d5d45838306e78aa079bd286592d6d98
SELECT CASE WHEN
 (SELECT COUNT(*) FROM d1_migrations)=163
 AND (SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1)='0162_lost_found_short_description.sql'
 AND (SELECT COUNT(*) FROM sqlite_master WHERE name IN ('breed_notion_workcopy_links_v3_new','admin_record_tombstones_v3_new','admin_record_publication_guards_v3_new','notion_webhook_inbox_v3','notion_discovery_cursor','notion_v3_atomicity_probe'))=0
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('breed_notion_workcopy_links','admin_record_tombstones','admin_record_publication_guards','notion_webhook_inbox'))=4
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND (instr(lower(coalesce(sql,'')),'breed_notion_workcopy_links')>0 OR instr(lower(coalesce(sql,'')),'admin_record_tombstones')>0 OR instr(lower(coalesce(sql,'')),'admin_record_publication_guards')>0 OR instr(lower(coalesce(sql,'')),'notion_webhook_inbox')>0))=27
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('unified_scope_breed_notion_workcopy_links_insert','unified_scope_breed_notion_workcopy_links_delete','unified_scope_breed_notion_workcopy_links_update','admin_deleted_directory_insert','admin_deleted_events_insert','admin_deleted_help_insert','admin_deleted_breeds_insert','admin_deleted_articles_insert','admin_deleted_adoptions_insert','admin_deleted_lost_found_insert','admin_deleted_organizations_insert','admin_removing_directory_update','admin_removing_events_update','admin_removing_help_update','admin_removing_breeds_update','admin_removing_articles_update','admin_removing_adoptions_update','admin_removing_lost_found_update','admin_removing_organizations_update','admin_guarded_directory_delete','admin_guarded_events_delete','admin_guarded_help_delete','admin_guarded_breeds_delete','admin_guarded_articles_delete','admin_guarded_adoptions_delete','admin_guarded_lost_found_delete','admin_guarded_organizations_delete'))=27
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND (instr(lower(coalesce(sql,'')),'breed_notion_workcopy_links')>0 OR instr(lower(coalesce(sql,'')),'admin_record_tombstones')>0 OR instr(lower(coalesce(sql,'')),'admin_record_publication_guards')>0 OR instr(lower(coalesce(sql,'')),'notion_webhook_inbox')>0))=6
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('admin_record_tombstones_external_idx','admin_record_tombstones_slug_idx','admin_record_tombstones_state_idx','idx_breed_notion_workcopy_status','notion_webhook_inbox_page','notion_webhook_inbox_pending'))=6
 AND NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='view' AND (instr(lower(coalesce(sql,'')),'breed_notion_workcopy_links')>0 OR instr(lower(coalesce(sql,'')),'admin_record_tombstones')>0 OR instr(lower(coalesce(sql,'')),'admin_record_publication_guards')>0 OR instr(lower(coalesce(sql,'')),'notion_webhook_inbox')>0))
 AND (SELECT COUNT(*) FROM notion_webhook_inbox WHERE status='PROCESSING')=0
 THEN 1 ELSE json_extract('V3_MANUAL_PREFLIGHT_FAILED','$') END;
-- UNNUMBERED PROPOSAL. Do not apply without owner approval, D1 bookmark,
-- dependency/schema inventory and offline verification in one atomic transaction.
-- New work-only breeds have no historical Notion original; never fabricate one.
-- Refuse to rebuild if any deployed table has an incoming foreign key.
-- Do not disable foreign keys or rely on cascades during a schema migration.
-- Fail closed on other table definitions mentioning a rebuilt table.
-- D1 denies the table-valued PRAGMA foreign_key_list in production.
SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM sqlite_master
 WHERE type='table' AND ((lower(name)<>'breed_notion_workcopy_links' AND instr(lower(coalesce(sql,'')),'breed_notion_workcopy_links')>0))
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

-- UNNUMBERED PROPOSAL. Do not apply without owner approval, D1 bookmark,
-- exact schema/dependency inventory and offline verification. Execute atomically.
-- Preserve all existing lifecycle rows and 24 triggers from migration 0164.
-- Refuse to rebuild if any deployed table has an incoming foreign key.
-- Do not disable foreign keys or rely on cascades during a schema migration.
-- Fail closed on other table definitions mentioning a rebuilt table.
-- D1 denies the table-valued PRAGMA foreign_key_list in production.
SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM sqlite_master
 WHERE type='table' AND ((lower(name)<>'admin_record_tombstones' AND instr(lower(coalesce(sql,'')),'admin_record_tombstones')>0) OR (lower(name)<>'admin_record_publication_guards' AND instr(lower(coalesce(sql,'')),'admin_record_publication_guards')>0))
) THEN 1 ELSE json_extract('V3_SCHEMA_INCOMING_FK','$') END;
DROP TRIGGER admin_deleted_directory_insert;
DROP TRIGGER admin_deleted_events_insert;
DROP TRIGGER admin_deleted_help_insert;
DROP TRIGGER admin_deleted_breeds_insert;
DROP TRIGGER admin_deleted_articles_insert;
DROP TRIGGER admin_deleted_adoptions_insert;
DROP TRIGGER admin_deleted_lost_found_insert;
DROP TRIGGER admin_deleted_organizations_insert;
DROP TRIGGER admin_removing_directory_update;
DROP TRIGGER admin_removing_events_update;
DROP TRIGGER admin_removing_help_update;
DROP TRIGGER admin_removing_breeds_update;
DROP TRIGGER admin_removing_articles_update;
DROP TRIGGER admin_removing_adoptions_update;
DROP TRIGGER admin_removing_lost_found_update;
DROP TRIGGER admin_removing_organizations_update;
DROP TRIGGER admin_guarded_directory_delete;
DROP TRIGGER admin_guarded_events_delete;
DROP TRIGGER admin_guarded_help_delete;
DROP TRIGGER admin_guarded_breeds_delete;
DROP TRIGGER admin_guarded_articles_delete;
DROP TRIGGER admin_guarded_adoptions_delete;
DROP TRIGGER admin_guarded_lost_found_delete;
DROP TRIGGER admin_guarded_organizations_delete;
CREATE TABLE admin_record_tombstones_v3_new (
  kind TEXT NOT NULL CHECK (kind IN ('directory','events','help','breeds','articles','adoptions','lost-found','organizations','eshops')),
  record_id INTEGER NOT NULL CHECK(record_id > 0),
  record_slug TEXT NOT NULL,
  record_external_key TEXT,
  record_name TEXT NOT NULL,
  record_category TEXT NOT NULL,
  notion_page_id TEXT,
  notion_data_source_id TEXT,
  notion_targets_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL CHECK(state IN ('PENDING_NOTION','ERROR_NOTION','READY_LOCAL','COMPLETE')),
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (kind, record_id),
  UNIQUE(notion_page_id)
);
CREATE TABLE admin_record_publication_guards_v3_new (
  kind TEXT NOT NULL CHECK (kind IN ('directory','events','help','breeds','articles','adoptions','lost-found','organizations','eshops')),
  record_id INTEGER NOT NULL,
  remote_state TEXT NOT NULL CHECK(remote_state IN ('PENDING','SYNCED','UNLINKED','NOT_APPLICABLE')),
  error_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(kind, record_id)
);
INSERT INTO admin_record_tombstones_v3_new (kind,record_id,record_slug,record_external_key,record_name,record_category,notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,attempts,created_by,created_at,updated_at,completed_at) SELECT kind,record_id,record_slug,record_external_key,record_name,record_category,notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,attempts,created_by,created_at,updated_at,completed_at FROM admin_record_tombstones;
INSERT INTO admin_record_publication_guards_v3_new (kind,record_id,remote_state,error_code,updated_at) SELECT kind,record_id,remote_state,error_code,updated_at FROM admin_record_publication_guards;
-- Force rollback if the copy is not byte-for-byte complete.
SELECT CASE WHEN (SELECT COUNT(*) FROM admin_record_tombstones_v3_new)=(SELECT COUNT(*) FROM admin_record_tombstones)
 AND NOT EXISTS(SELECT kind,record_id,record_slug,record_external_key,record_name,record_category,notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,attempts,created_by,created_at,updated_at,completed_at FROM admin_record_tombstones EXCEPT SELECT kind,record_id,record_slug,record_external_key,record_name,record_category,notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,attempts,created_by,created_at,updated_at,completed_at FROM admin_record_tombstones_v3_new)
 AND (SELECT COUNT(*) FROM admin_record_publication_guards_v3_new)=(SELECT COUNT(*) FROM admin_record_publication_guards)
 AND NOT EXISTS(SELECT kind,record_id,remote_state,error_code,updated_at FROM admin_record_publication_guards EXCEPT SELECT kind,record_id,remote_state,error_code,updated_at FROM admin_record_publication_guards_v3_new)
 THEN 1 ELSE json_extract('LIFECYCLE_COPY_MISMATCH','$') END;
DROP TABLE admin_record_tombstones;
DROP TABLE admin_record_publication_guards;
ALTER TABLE admin_record_tombstones_v3_new RENAME TO admin_record_tombstones;
ALTER TABLE admin_record_publication_guards_v3_new RENAME TO admin_record_publication_guards;
CREATE INDEX IF NOT EXISTS admin_record_tombstones_state_idx
  ON admin_record_tombstones(state, updated_at);
CREATE INDEX IF NOT EXISTS admin_record_tombstones_slug_idx
  ON admin_record_tombstones(kind, record_slug);
CREATE INDEX IF NOT EXISTS admin_record_tombstones_external_idx
  ON admin_record_tombstones(kind,record_external_key);
-- Canonical insert barriers provide a final D1 safeguard against generic importers
-- and Gemini accidentally recreating the exact deleted slug.
CREATE TRIGGER IF NOT EXISTS admin_deleted_directory_insert
  BEFORE INSERT ON directory_profiles
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='directory' AND (record_slug=NEW.slug OR (NEW.import_key IS NOT NULL AND length(trim(NEW.import_key))>0 AND record_external_key=trim(NEW.import_key))))
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_events_insert
  BEFORE INSERT ON managed_events
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='events' AND record_slug=NEW.slug)
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_help_insert
  BEFORE INSERT ON help_cases
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='help' AND record_slug=NEW.slug)
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_breeds_insert
  BEFORE INSERT ON managed_breeds
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND (record_slug=NEW.slug OR (NEW.fci_number IS NOT NULL AND NEW.fci_number > 0 AND record_external_key=CAST(NEW.fci_number AS TEXT))))
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_articles_insert
  BEFORE INSERT ON managed_articles
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='articles' AND record_slug=NEW.slug)
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_adoptions_insert
  BEFORE INSERT ON adoption_dogs
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='adoptions' AND record_slug=NEW.slug)
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_lost_found_insert
  BEFORE INSERT ON lost_found_dog_reports
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='lost-found' AND record_slug=NEW.slug)
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;
CREATE TRIGGER IF NOT EXISTS admin_deleted_organizations_insert
  BEFORE INSERT ON help_organizations
  WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='organizations' AND (record_slug=NEW.slug OR (NEW.import_key IS NOT NULL AND length(trim(NEW.import_key))>0 AND record_external_key=trim(NEW.import_key))))
  BEGIN SELECT RAISE(ABORT, 'RECORD_TOMBSTONED'); END;


-- Never allow another editor, cron or import to republish/rename a record
-- while any stage of its owner-confirmed removal is unfinished.
CREATE TRIGGER IF NOT EXISTS admin_removing_directory_update
  BEFORE UPDATE OF status, slug ON directory_profiles
  WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='directory' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_events_update
  BEFORE UPDATE OF status, slug ON managed_events
  WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='events' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_help_update
  BEFORE UPDATE OF status, slug ON help_cases
  WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='help' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_breeds_update
  BEFORE UPDATE OF status, slug ON managed_breeds
  WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_articles_update
  BEFORE UPDATE OF status, slug ON managed_articles
  WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='articles' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_adoptions_update
  BEFORE UPDATE OF status, slug ON adoption_dogs
  WHEN (NEW.status <> 'DRAFT' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='adoptions' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_lost_found_update
  BEFORE UPDATE OF status, slug ON lost_found_dog_reports
  WHEN (NEW.status <> 'DRAFT' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='lost-found' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER IF NOT EXISTS admin_removing_organizations_update
  BEFORE UPDATE OF status, slug ON help_organizations
  WHEN (NEW.status <> 'DRAFT' OR NEW.slug <> OLD.slug)
    AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='organizations' AND record_id=OLD.id AND state<>'COMPLETE')
  BEGIN SELECT RAISE(ABORT, 'RECORD_REMOVAL_PENDING'); END;

-- Direct DELETE from any legacy API/importer requires a confirmed lifecycle receipt.
CREATE TRIGGER IF NOT EXISTS admin_guarded_directory_delete
 BEFORE DELETE ON directory_profiles
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='directory' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_events_delete
 BEFORE DELETE ON managed_events
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='events' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_help_delete
 BEFORE DELETE ON help_cases
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='help' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_breeds_delete
 BEFORE DELETE ON managed_breeds
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_articles_delete
 BEFORE DELETE ON managed_articles
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='articles' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_adoptions_delete
 BEFORE DELETE ON adoption_dogs
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='adoptions' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_lost_found_delete
 BEFORE DELETE ON lost_found_dog_reports
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='lost-found' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS admin_guarded_organizations_delete
 BEFORE DELETE ON help_organizations
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='organizations' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;

-- Ninth kind: E-shops. Keep original protection and rating FK restrictions.
CREATE TRIGGER admin_deleted_eshops_insert BEFORE INSERT ON managed_eshops
 WHEN EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='eshops' AND (record_slug=NEW.slug OR
 (trim(NEW.website_url)<>'' AND record_external_key=lower(rtrim(trim(NEW.website_url),'/')))))
 BEGIN SELECT RAISE(ABORT,'RECORD_TOMBSTONED'); END;
CREATE TRIGGER admin_removing_eshops_update BEFORE UPDATE OF status, slug ON managed_eshops
 WHEN (NEW.status<>'draft' OR NEW.slug<>OLD.slug)
 AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='eshops' AND record_id=OLD.id AND state<>'COMPLETE')
 BEGIN SELECT RAISE(ABORT,'RECORD_REMOVAL_PENDING'); END;
CREATE TRIGGER admin_guarded_eshops_delete BEFORE DELETE ON managed_eshops
 WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='eshops' AND record_id=OLD.id AND state='READY_LOCAL')
 BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;

-- UNNUMBERED PROPOSAL. Apply only after owner approval, D1 recovery bookmark,
-- exact schema/dependency inventory and offline verification in one atomic transaction.
-- Conservatively reject any other table definition mentioning this table.
-- No table-valued PRAGMA: production D1 rejects that query with SQLITE_AUTH.
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM sqlite_master
  WHERE type='table' AND lower(name)<>'notion_webhook_inbox'
    AND instr(lower(coalesce(sql,'')),'notion_webhook_inbox')>0
) THEN 1 ELSE json_extract('WEBHOOK_INBOX_DEPENDENCY','$') END;
CREATE TABLE notion_webhook_inbox_v3 (
  event_key TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page.created','page.properties_updated','page.content_updated','page.deleted')),
  changed_properties_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','DONE','REVIEW')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_until INTEGER,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  outcome TEXT,
  last_error_code TEXT
);

INSERT INTO notion_webhook_inbox_v3 (event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code)
SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox;
-- Preserve all receipts and their state before dropping the old table.
SELECT CASE WHEN (SELECT COUNT(*) FROM notion_webhook_inbox_v3)=(SELECT COUNT(*) FROM notion_webhook_inbox)
 AND NOT EXISTS(SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox EXCEPT SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox_v3)
 THEN 1 ELSE json_extract('WEBHOOK_INBOX_COPY_MISMATCH','$') END;
DROP TABLE notion_webhook_inbox;
ALTER TABLE notion_webhook_inbox_v3 RENAME TO notion_webhook_inbox;
CREATE INDEX notion_webhook_inbox_pending ON notion_webhook_inbox(status,next_attempt_at,received_at);
CREATE INDEX notion_webhook_inbox_page ON notion_webhook_inbox(page_id,status);

-- Technical checkpoint only. Number/apply after main integration and owner approval.
-- Separate from the field recovery cursor so an older worker cannot claim a
-- discovery row as an editable field. No canonical content or new cron.
CREATE TABLE IF NOT EXISTS notion_discovery_cursor (
  agenda TEXT NOT NULL CHECK (agenda IN ('directory','eshops','breeds','articles')),
  source_id TEXT NOT NULL,
  next_cursor TEXT,
  lease_until INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agenda,source_id)
);

-- The copy guards in the pinned SQL check the actual values before each DROP.
SELECT 'breed_notion_workcopy_links' AS tabulka, COUNT(*) AS pocet FROM breed_notion_workcopy_links
UNION ALL SELECT 'admin_record_tombstones', COUNT(*) FROM admin_record_tombstones
UNION ALL SELECT 'admin_record_publication_guards', COUNT(*) FROM admin_record_publication_guards
UNION ALL SELECT 'notion_webhook_inbox', COUNT(*) FROM notion_webhook_inbox
UNION ALL SELECT 'notion_discovery_cursor', COUNT(*) FROM notion_discovery_cursor;
