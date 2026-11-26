-- Numbered additive V2 migration; apply in order after owner approval.
-- Invalidate proofs on mapping identity and review-lock transitions; ordinary hash updates are not remaps.
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_notion_sync_insert
AFTER INSERT ON directory_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(NEW.directory_profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(NEW.directory_profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(NEW.directory_profile_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_notion_sync_delete
AFTER DELETE ON directory_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(OLD.directory_profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(OLD.directory_profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(OLD.directory_profile_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_notion_sync_update
AFTER UPDATE OF directory_profile_id,notion_page_id ON directory_notion_sync
WHEN OLD.directory_profile_id IS NOT NEW.directory_profile_id OR OLD.notion_page_id IS NOT NEW.notion_page_id
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(OLD.directory_profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(OLD.directory_profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(OLD.directory_profile_id AS TEXT);
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(NEW.directory_profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(NEW.directory_profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(NEW.directory_profile_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_event_notion_sync_insert
AFTER INSERT ON event_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('events',CAST(NEW.event_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='events' AND entity_id=CAST(NEW.event_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='events' AND entity_id=CAST(NEW.event_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_event_notion_sync_delete
AFTER DELETE ON event_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('events',CAST(OLD.event_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='events' AND entity_id=CAST(OLD.event_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='events' AND entity_id=CAST(OLD.event_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_event_notion_sync_update
AFTER UPDATE OF event_id,notion_page_id ON event_notion_sync
WHEN OLD.event_id IS NOT NEW.event_id OR OLD.notion_page_id IS NOT NEW.notion_page_id
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('events',CAST(OLD.event_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='events' AND entity_id=CAST(OLD.event_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='events' AND entity_id=CAST(OLD.event_id AS TEXT);
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('events',CAST(NEW.event_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='events' AND entity_id=CAST(NEW.event_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='events' AND entity_id=CAST(NEW.event_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_eshop_notion_sync_insert
AFTER INSERT ON eshop_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('eshops',CAST(NEW.eshop_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='eshops' AND entity_id=CAST(NEW.eshop_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='eshops' AND entity_id=CAST(NEW.eshop_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_eshop_notion_sync_delete
AFTER DELETE ON eshop_notion_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('eshops',CAST(OLD.eshop_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='eshops' AND entity_id=CAST(OLD.eshop_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='eshops' AND entity_id=CAST(OLD.eshop_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_eshop_notion_sync_update
AFTER UPDATE OF eshop_id,notion_page_id ON eshop_notion_sync
WHEN OLD.eshop_id IS NOT NEW.eshop_id OR OLD.notion_page_id IS NOT NEW.notion_page_id
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('eshops',CAST(OLD.eshop_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='eshops' AND entity_id=CAST(OLD.eshop_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='eshops' AND entity_id=CAST(OLD.eshop_id AS TEXT);
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('eshops',CAST(NEW.eshop_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='eshops' AND entity_id=CAST(NEW.eshop_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='eshops' AND entity_id=CAST(NEW.eshop_id AS TEXT);
END;
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
CREATE TRIGGER IF NOT EXISTS unified_scope_notion_agenda_sync_insert
AFTER INSERT ON notion_agenda_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (NEW.agenda,CAST(NEW.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=NEW.agenda AND entity_id=CAST(NEW.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=NEW.agenda AND entity_id=CAST(NEW.entity_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_notion_agenda_sync_delete
AFTER DELETE ON notion_agenda_sync
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (OLD.agenda,CAST(OLD.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=OLD.agenda AND entity_id=CAST(OLD.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=OLD.agenda AND entity_id=CAST(OLD.entity_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_notion_agenda_sync_update
AFTER UPDATE OF entity_id,notion_page_id,agenda ON notion_agenda_sync
WHEN OLD.entity_id IS NOT NEW.entity_id OR OLD.notion_page_id IS NOT NEW.notion_page_id OR OLD.agenda IS NOT NEW.agenda
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (OLD.agenda,CAST(OLD.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=OLD.agenda AND entity_id=CAST(OLD.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=OLD.agenda AND entity_id=CAST(OLD.entity_id AS TEXT);
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (NEW.agenda,CAST(NEW.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=NEW.agenda AND entity_id=CAST(NEW.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=NEW.agenda AND entity_id=CAST(NEW.entity_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_admin_review_insert
AFTER INSERT ON admin_entity_reviews
WHEN NEW.entity_type IN ('EVENT','ORGANIZATION','ADOPTION','LOST_FOUND','HELP_CASE')
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (CASE NEW.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END,CAST(NEW.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=CASE NEW.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END AND entity_id=CAST(NEW.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=CASE NEW.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END AND entity_id=CAST(NEW.entity_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_review_insert
AFTER INSERT ON directory_profile_review_state
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(NEW.profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(NEW.profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(NEW.profile_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_admin_review_delete
AFTER DELETE ON admin_entity_reviews
WHEN OLD.entity_type IN ('EVENT','ORGANIZATION','ADOPTION','LOST_FOUND','HELP_CASE')
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES (CASE OLD.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END,CAST(OLD.entity_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda=CASE OLD.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END AND entity_id=CAST(OLD.entity_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda=CASE OLD.entity_type WHEN 'EVENT' THEN 'events' WHEN 'ORGANIZATION' THEN 'organizations' WHEN 'ADOPTION' THEN 'adoptions' WHEN 'LOST_FOUND' THEN 'lost-found' WHEN 'HELP_CASE' THEN 'help-cases' END AND entity_id=CAST(OLD.entity_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_review_delete
AFTER DELETE ON directory_profile_review_state
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(OLD.profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(OLD.profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(OLD.profile_id AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS unified_scope_directory_review_update
AFTER UPDATE OF reviewed_at,unlock_pending ON directory_profile_review_state
WHEN OLD.reviewed_at IS NOT NEW.reviewed_at OR OLD.unlock_pending IS NOT NEW.unlock_pending
BEGIN
  INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at)
    VALUES ('directory',CAST(NEW.profile_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at;
  UPDATE notion_unified_field_state
    SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL,
        notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',
        version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),recovery_after=NULL
    WHERE agenda='directory' AND entity_id=CAST(NEW.profile_id AS TEXT);
  DELETE FROM notion_unified_admin_field_edits
    WHERE agenda='directory' AND entity_id=CAST(NEW.profile_id AS TEXT);
END;
