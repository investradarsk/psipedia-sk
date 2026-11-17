WITH expected(migration, object_type, object_name) AS (
 VALUES
  ('0163','table','breed_notion_controlled_values'),
  ('0164','table','admin_record_tombstones'),
  ('0164','table','admin_record_publication_guards'),
  ('0164','index','admin_record_tombstones_state_idx'),
  ('0164','index','admin_record_tombstones_slug_idx'),
  ('0164','index','admin_record_tombstones_external_idx'),
  ('0164','trigger','admin_deleted_directory_insert'),
  ('0164','trigger','admin_deleted_events_insert'),
  ('0164','trigger','admin_deleted_help_insert'),
  ('0164','trigger','admin_deleted_breeds_insert'),
  ('0164','trigger','admin_deleted_articles_insert'),
  ('0164','trigger','admin_deleted_adoptions_insert'),
  ('0164','trigger','admin_deleted_lost_found_insert'),
  ('0164','trigger','admin_deleted_organizations_insert'),
  ('0164','trigger','admin_removing_directory_update'),
  ('0164','trigger','admin_removing_events_update'),
  ('0164','trigger','admin_removing_help_update'),
  ('0164','trigger','admin_removing_breeds_update'),
  ('0164','trigger','admin_removing_articles_update'),
  ('0164','trigger','admin_removing_adoptions_update'),
  ('0164','trigger','admin_removing_lost_found_update'),
  ('0164','trigger','admin_removing_organizations_update'),
  ('0164','trigger','admin_guarded_directory_delete'),
  ('0164','trigger','admin_guarded_events_delete'),
  ('0164','trigger','admin_guarded_help_delete'),
  ('0164','trigger','admin_guarded_breeds_delete'),
  ('0164','trigger','admin_guarded_articles_delete'),
  ('0164','trigger','admin_guarded_adoptions_delete'),
  ('0164','trigger','admin_guarded_lost_found_delete'),
  ('0164','trigger','admin_guarded_organizations_delete'),
  ('0165','column','public_phone'),
  ('0165','column','public_email'),
  ('0165','column','public_website_url'),
  ('0165','column','public_facebook_url'),
  ('0165','column','public_instagram_url'),
  ('0166','table','facebook_weekly_template'),
  ('0166','table','facebook_weekly_template_marks'),
  ('0167','table','directory_profile_view_hourly'),
  ('0167','index','directory_profile_view_hourly_window_idx'),
  ('0167','index','profile_view_rate_expiry_idx'),
  ('0167','view','content_qualified_views_hourly'),
  ('0168','table','site_analytics_hourly'),
  ('0168','table','site_analytics_pages_hourly'),
  ('0169','table','directory_breeder_club_relations'),
  ('0169','index','directory_breeder_club_relations_unique'),
  ('0169','index','directory_breeder_club_relations_club_idx')
), found AS (
 SELECT type AS object_type, name AS object_name FROM sqlite_schema
 UNION ALL
 SELECT 'column' AS object_type, name AS object_name FROM pragma_table_info('lost_found_dog_reports')
), checked AS (
 SELECT e.migration,e.object_type,e.object_name,
   CASE WHEN EXISTS (SELECT 1 FROM found f
    WHERE f.object_type=e.object_type AND f.object_name=e.object_name)
    THEN 1 ELSE 0 END AS is_present
 FROM expected e
), grouped AS (
 SELECT migration,
 COUNT(*) AS expected_objects,
 SUM(is_present) AS present_objects,
 COUNT(*)-SUM(is_present) AS missing_objects,
 GROUP_CONCAT(CASE WHEN is_present=0 THEN object_name END, ', ') AS missing_names
 FROM checked GROUP BY migration
)
SELECT g.migration,
 CASE WHEN EXISTS (SELECT 1 FROM d1_migrations d
  WHERE substr(d.name,1,4)=g.migration) THEN 1 ELSE 0 END AS history_recorded,
 g.expected_objects,g.present_objects,g.missing_objects,
 CASE
  WHEN g.present_objects=0 AND NOT EXISTS
   (SELECT 1 FROM d1_migrations d WHERE substr(d.name,1,4)=g.migration)
    THEN 'NOT_APPLIED'
  WHEN g.present_objects=g.expected_objects AND EXISTS
   (SELECT 1 FROM d1_migrations d WHERE substr(d.name,1,4)=g.migration)
    THEN 'RECORDED_AND_PHYSICALLY_PRESENT'
  WHEN g.present_objects=g.expected_objects THEN 'PRESENT_WITHOUT_LEDGER_CHECK_ISOLATED'
  ELSE 'PARTIAL_OR_INCONSISTENT_STOP'
 END AS status,
 COALESCE(g.missing_names,'') AS missing_names
FROM grouped g ORDER BY g.migration;
