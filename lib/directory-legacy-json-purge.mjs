/** Owner-approved destructive cleanup of the historical Directory JSON payload.
 * Deletes legacy editorial JSON values in place. The NOT NULL column stays
 * as a temporary '{}'-only compatibility shim for existing prepared SQL.
 * We intentionally do not alter unrelated JSON, Services V3 or D1 relations.
 *
 * Security: never clear an actively reviewed, partner-managed or unsafe row.
 * Those are governed by legacy review/ownership locks in existing Notion paths.
 */
const jsonSafe = "CASE WHEN json_valid(p.source_data_json) THEN p.source_data_json ELSE '{}' END";
const reviewed = `NULLIF(TRIM(CAST(json_extract(${jsonSafe}, '$._psipedia_profile_review_reviewed_at') AS TEXT)), '') IS NOT NULL`;
const pending = `CAST(COALESCE(json_extract(${jsonSafe}, '$._psipedia_profile_review_unlock_pending'), '0') AS TEXT)='1'`;
export const DIRECTORY_LEGACY_JSON_PROTECTED_SQL = `(
  ${reviewed} OR ${pending}
  OR EXISTS(SELECT 1 FROM directory_profile_review_state s WHERE s.profile_id=p.id
    AND (NULLIF(TRIM(s.reviewed_at),'') IS NOT NULL OR s.unlock_pending=1))
  OR EXISTS(SELECT 1 FROM partner_resources r JOIN partner_memberships m
    ON m.resource_id=r.id
    WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=p.id
      AND m.revoked_at IS NULL)
)`;

export const DIRECTORY_LEGACY_JSON_PURGE_SQL =
  "UPDATE directory_profiles AS p SET source_data_json='{}' " +
  "WHERE p.source_data_json<>'{}' AND NOT " + DIRECTORY_LEGACY_JSON_PROTECTED_SQL;

export const DIRECTORY_LEGACY_JSON_STATUS_SQL =
  "SELECT COUNT(*) AS profiles, " +
  "SUM(CASE WHEN source_data_json='{}' THEN 1 ELSE 0 END) AS empty_legacy, " +
  "SUM(CASE WHEN source_data_json<>'{}' THEN 1 ELSE 0 END) AS remaining_legacy " +
  "FROM directory_profiles";

export const DIRECTORY_LEGACY_JSON_PROTECTED_COUNT_SQL =
  "SELECT COUNT(*) AS protected_profiles FROM directory_profiles p WHERE " +
  DIRECTORY_LEGACY_JSON_PROTECTED_SQL;
