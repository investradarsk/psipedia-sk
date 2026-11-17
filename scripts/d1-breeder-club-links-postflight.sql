-- READ ONLY: run AFTER owner-authorised zero-start reset, BEFORE deployment.
-- All previous station/club/breed links must be blank for manual fresh entry.
SELECT
  (SELECT COUNT(*) FROM sqlite_schema
    WHERE type='table' AND name='directory_breeder_club_relations') AS station_club_table_exists,
  (SELECT COUNT(*) FROM directory_breeder_club_relations) AS station_club_links,
  (SELECT COUNT(*) FROM breed_directory_relations r
   JOIN directory_profiles p ON p.id=r.profile_id
   WHERE p.category='chovatelske-stanice') AS station_breed_links,
  (SELECT COUNT(*) FROM breed_directory_relations r
   JOIN directory_profiles p ON p.id=r.profile_id
   WHERE p.category='chovatelske-kluby') AS club_breed_links,
  (SELECT COUNT(*) FROM breed_directory_relations r
   JOIN directory_profiles p ON p.id=r.profile_id
   WHERE p.category NOT IN ('chovatelske-stanice','chovatelske-kluby')) AS unaffected_other_links;
