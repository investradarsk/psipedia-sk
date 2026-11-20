-- One-time SQL-only cleanup. Cloudflare D1 /query MUST execute this whole file as ONE atomic batch.
-- Never paste the statements separately. No Notion HTTP calls. Only history in help_cases.
-- Technical JSON columns and current canonical tables never change.
CREATE TABLE __psipedia_help_legacy_140_guard_20261120 (
 ok INTEGER NOT NULL CHECK (ok=1),
 generic_before INTEGER NOT NULL,
 adoptions_before INTEGER NOT NULL,
 organizations_before INTEGER NOT NULL,
 lost_found_before INTEGER NOT NULL
);
INSERT INTO __psipedia_help_legacy_140_guard_20261120 (ok,generic_before,adoptions_before,organizations_before,lost_found_before)
SELECT CASE WHEN
 (SELECT COUNT(*) FROM help_cases WHERE category='adopcia')=36
 AND (SELECT COUNT(*) FROM help_cases WHERE category='utulky')=104
 AND (SELECT COUNT(*) FROM help_cases WHERE category='stratene-a-najdene')=0
 AND (SELECT COUNT(*) FROM help_cases WHERE category IN ('adopcia','utulky') AND status='published')=140
 AND (SELECT COUNT(DISTINCT slug) FROM help_cases WHERE category IN ('adopcia','utulky'))=140
 AND (SELECT COUNT(*) FROM help_cases h WHERE h.category='adopcia' AND EXISTS(SELECT 1 FROM adoption_dogs d WHERE d.slug=h.slug))=36
 AND (SELECT COUNT(*) FROM help_cases h WHERE h.category='utulky' AND EXISTS(SELECT 1 FROM help_organizations o WHERE o.slug=h.slug))=94
 AND (SELECT COUNT(*) FROM help_cases h WHERE h.category='utulky' AND NOT EXISTS(SELECT 1 FROM help_organizations o WHERE o.slug=h.slug) AND h.slug IN ('ceskoslovensky-kastracny-program','pomoc-mesto-dolny-kubin','pomoc-mesto-handlova','pomoc-mesto-malacky','pomoc-mesto-martin-mestsky-urad-martin','pomoc-mesto-mestsky-urad-kolarovo','pomoc-mesto-revuca','pomoc-mesto-skalica','pomoc-obec-priepasne','pomoc-td-s-r-o'))=10
 AND NOT EXISTS(SELECT 1 FROM help_cases h WHERE h.category='utulky' AND NOT EXISTS(SELECT 1 FROM help_organizations o WHERE o.slug=h.slug) AND h.slug NOT IN ('ceskoslovensky-kastracny-program','pomoc-mesto-dolny-kubin','pomoc-mesto-handlova','pomoc-mesto-malacky','pomoc-mesto-martin-mestsky-urad-martin','pomoc-mesto-mestsky-urad-kolarovo','pomoc-mesto-revuca','pomoc-mesto-skalica','pomoc-obec-priepasne','pomoc-td-s-r-o'))
 AND (SELECT COUNT(*) FROM notion_agenda_sync m JOIN help_cases h ON h.id=m.entity_id WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky'))=140
 AND NOT EXISTS(SELECT 1 FROM help_cases h WHERE h.category IN ('adopcia','utulky') AND NOT EXISTS(SELECT 1 FROM notion_agenda_sync m WHERE m.agenda='help-cases' AND m.entity_id=h.id))
 AND NOT EXISTS(SELECT 1 FROM notion_agenda_sync m JOIN help_cases h ON h.id=m.entity_id JOIN notion_agenda_sync other ON lower(replace(other.notion_page_id,'-',''))=lower(replace(m.notion_page_id,'-','')) WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky') AND other.agenda<>'help-cases')
 AND NOT EXISTS(SELECT 1 FROM notion_agenda_sync m JOIN help_cases h ON h.id=m.entity_id JOIN admin_record_tombstones t ON lower(replace(t.notion_page_id,'-',''))=lower(replace(m.notion_page_id,'-','')) WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky'))
 AND NOT EXISTS(SELECT 1 FROM help_cases h JOIN admin_record_tombstones t ON t.kind='help' AND (t.record_id=h.id OR t.record_slug=h.slug) WHERE h.category IN ('adopcia','utulky'))
 AND NOT EXISTS(SELECT 1 FROM partner_help_claims p JOIN help_cases h ON h.id=p.help_case_id WHERE h.category IN ('adopcia','utulky'))
 AND NOT EXISTS(SELECT 1 FROM notion_manual_transfer_items i JOIN notion_agenda_sync m ON m.notion_page_id=i.notion_page_id JOIN help_cases h ON h.id=m.entity_id WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky') AND i.status IN ('RUNNING','PREVIEWING'))
 AND EXISTS(SELECT 1 FROM notion_agenda_targets WHERE agenda='help-cases' AND length(trim(data_source_id))>0)
 AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='admin_guarded_help_delete')
 THEN 1 ELSE 0 END,
 (SELECT COUNT(*) FROM help_cases WHERE category NOT IN ('adopcia','utulky','stratene-a-najdene')),
 (SELECT COUNT(*) FROM adoption_dogs),
 (SELECT COUNT(*) FROM help_organizations),
 (SELECT COUNT(*) FROM lost_found_dog_reports);

-- D1 tombstones retain old Notion page IDs as anti-reimport guards.
-- The source marker means SQL-only cleanup, NOT that Notion was trashed.
INSERT INTO admin_record_tombstones (
 kind,record_id,record_slug,record_external_key,record_name,record_category,
 notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,
 created_by,created_at,updated_at
)
SELECT 'help',h.id,h.slug,'HISTORICAL_SQL_ONLY_NOTION_RETAINED',h.title,h.category,m.notion_page_id,
 (SELECT data_source_id FROM notion_agenda_targets WHERE agenda='help-cases'),
 '[]','READY_LOCAL',NULL,'owner-approved-sql-only-cleanup',
 strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM help_cases h JOIN notion_agenda_sync m ON m.agenda='help-cases' AND m.entity_id=h.id
WHERE h.category IN ('adopcia','utulky');

-- Only local D1 queues/snapshots, never remote Notion pages.
UPDATE notion_manual_transfer_items
SET status='SKIPPED',last_error_code='HISTORICAL_SQL_ONLY_NOTION_RETAINED',
 finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status NOT IN ('DONE','SKIPPED')
AND EXISTS(SELECT 1 FROM notion_agenda_sync m JOIN help_cases h ON h.id=m.entity_id
 WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky')
 AND m.notion_page_id=notion_manual_transfer_items.notion_page_id);

DELETE FROM notion_webhook_inbox WHERE page_id IN (
 SELECT m.notion_page_id FROM notion_agenda_sync m JOIN help_cases h ON h.id=m.entity_id
 WHERE m.agenda='help-cases' AND h.category IN ('adopcia','utulky')
);
DELETE FROM notion_profile_field_baselines
WHERE agenda='help-cases' AND entity_id IN(SELECT id FROM help_cases WHERE category IN ('adopcia','utulky'));
DELETE FROM admin_record_publication_guards
WHERE kind='help' AND record_id IN(SELECT id FROM help_cases WHERE category IN ('adopcia','utulky'));
DELETE FROM notion_agenda_sync
WHERE agenda='help-cases' AND entity_id IN(SELECT id FROM help_cases WHERE category IN ('adopcia','utulky'));

-- The existing 0164 protected DELETE trigger accepts only READY_LOCAL D1 tombstones.
DELETE FROM help_cases WHERE category IN ('adopcia','utulky');

UPDATE admin_record_tombstones
SET state='COMPLETE',
 completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE kind='help' AND record_external_key='HISTORICAL_SQL_ONLY_NOTION_RETAINED' AND state='READY_LOCAL';

-- Roll back the ENTIRE batch if the postconditions do not match exactly.
INSERT INTO __psipedia_help_legacy_140_guard_20261120(ok,generic_before,adoptions_before,organizations_before,lost_found_before)
SELECT CASE WHEN
 (SELECT COUNT(*) FROM help_cases WHERE category IN ('adopcia','utulky','stratene-a-najdene'))=0
 AND (SELECT COUNT(*) FROM admin_record_tombstones
   WHERE kind='help' AND record_external_key='HISTORICAL_SQL_ONLY_NOTION_RETAINED' AND state='COMPLETE')=140
 AND (SELECT COUNT(*) FROM notion_agenda_sync m JOIN admin_record_tombstones t
  ON m.agenda='help-cases' AND m.entity_id=t.record_id AND t.kind='help'
  WHERE t.record_external_key='HISTORICAL_SQL_ONLY_NOTION_RETAINED')=0
 AND (SELECT COUNT(*) FROM help_cases
   WHERE category NOT IN ('adopcia','utulky','stratene-a-najdene'))=g.generic_before
 AND (SELECT COUNT(*) FROM adoption_dogs)=g.adoptions_before
 AND (SELECT COUNT(*) FROM help_organizations)=g.organizations_before
 AND (SELECT COUNT(*) FROM lost_found_dog_reports)=g.lost_found_before
 THEN 1 ELSE 0 END,
 g.generic_before,g.adoptions_before,g.organizations_before,g.lost_found_before
FROM __psipedia_help_legacy_140_guard_20261120 g LIMIT 1;
DROP TABLE __psipedia_help_legacy_140_guard_20261120;
SELECT
 (SELECT COUNT(*) FROM help_cases WHERE category IN ('adopcia','utulky','stratene-a-najdene')) historical_remaining,
 (SELECT COUNT(*) FROM admin_record_tombstones
  WHERE kind='help' AND record_external_key='HISTORICAL_SQL_ONLY_NOTION_RETAINED' AND state='COMPLETE') historical_removed,
 (SELECT COUNT(*) FROM notion_agenda_sync m JOIN admin_record_tombstones t
  ON m.agenda='help-cases' AND m.entity_id=t.record_id AND t.kind='help'
  WHERE t.record_external_key='HISTORICAL_SQL_ONLY_NOTION_RETAINED') obsolete_mapping_remaining;
