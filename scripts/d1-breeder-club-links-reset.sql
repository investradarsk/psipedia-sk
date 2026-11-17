-- DESTRUCTIVE, MANUAL, ONE TIME, OWNER APPROVAL REQUIRED.
-- Run ONLY after validated D1 backup, schema 0169, and confirmation that
-- ALL old breed/club links for stations AND kennel clubs shall be re-entered manually.
-- Do NOT run on deploy or after people start editing new relations.
-- Preserve every other profile, Notion content and all unrelated relation types.
-- Clear existing station->breed and club->breed links (including 38 known club links).
DELETE FROM breed_directory_relations
WHERE profile_id IN (
  SELECT id FROM directory_profiles
  WHERE category IN ('chovatelske-stanice','chovatelske-kluby')
);
-- New station->club table starts empty. If it has rows already, STOP and audit.
-- NEVER delete historical source_data_json here; it is not used as live linkage.
