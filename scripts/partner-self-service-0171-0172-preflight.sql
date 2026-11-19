-- Read-only D1 preflight for prepared Partner migrations 0171 / 0172.
-- Run against canonical psipedia-sk-db using the protected owner workflow.
-- This file NEVER creates schema, updates records or dispatches migrations.
-- Every non-zero violation count is an explicit stop, not an invitation to auto-fix.
PRAGMA foreign_key_check;

SELECT 'active_manager_duplicate' AS finding, resource_id AS subject,
       COUNT(*) AS violation_count
FROM partner_memberships
WHERE revoked_at IS NULL
GROUP BY resource_id
HAVING COUNT(*) > 1
ORDER BY resource_id;

SELECT 'active_manager_legacy_role' AS finding, role AS subject,
       COUNT(*) AS violation_count
FROM partner_memberships
WHERE revoked_at IS NULL AND role <> 'OWNER'
GROUP BY role
ORDER BY role;

SELECT 'inactive_account_active_membership' AS finding, a.status AS subject,
       COUNT(*) AS violation_count
FROM partner_memberships m JOIN partner_accounts a ON a.id = m.account_id
WHERE m.revoked_at IS NULL AND a.status <> 'ACTIVE'
GROUP BY a.status
ORDER BY a.status;

SELECT 'partner_help_schema_state' AS finding, name AS subject, 1 AS object_present
FROM sqlite_master
WHERE name IN (
  'partner_memberships_one_active_resource',
  'partner_memberships_only_owner_insert',
  'partner_memberships_only_owner_update',
  'partner_help_claims',
  'partner_help_claims_adoption_manager',
  'partner_help_claims_report_manager',
  'partner_help_claims_case_manager'
)
ORDER BY name;

SELECT 'canonical_table_present' AS finding, name AS subject, 1 AS object_present
FROM sqlite_master
WHERE type='table'
  AND name IN (
    'partner_accounts','partner_resources','partner_memberships',
    'partner_audit_events','partner_notification_outbox',
    'moderation_submissions','moderation_events',
    'adoption_dogs','lost_found_dog_reports','help_cases'
  )
ORDER BY name;

-- 0170 is a prerequisite for Partner directory public contacts, filters
-- and secondary categories. The production D1 must contain these columns
-- and tables before Partner direct editing is enabled.
PRAGMA table_info(directory_profiles);

SELECT 'directory_0170_table_present' AS finding, name AS subject, 1 AS object_present
FROM sqlite_master
WHERE type='table' AND name IN (
  'directory_profile_filter_values',
  'directory_profile_additional_categories',
  'directory_profile_public_facts'
)
ORDER BY name;
