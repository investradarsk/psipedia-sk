-- UNNUMBERED PROPOSAL. Do not apply without owner approval, D1 bookmark,
-- exact schema/dependency inventory and offline verification. Execute atomically.
-- Preserve all existing lifecycle rows and 24 triggers from migration 0164.
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
