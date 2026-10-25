/**
 * Request-scoped moderation lookups for the admin GEO operator.
 *
 * The historical admin query ranked *every* GEO/organization moderation event
 * before joining to the published rows. This variant probes the existing
 * moderation_events_subject_created_idx by (resource_type, subject_id) instead.
 *
 * The SQL expressions below accept only developer-owned SQL column references.
 * Never pass request values or other untrusted input as column references.
 */
export function explicitPrivateGeoSql(geoPointIdSql: "g.id"): string {
  return `EXISTS (
    SELECT 1 FROM moderation_events private_decision
    WHERE private_decision.resource_type = 'GEO_POINT'
      AND private_decision.subject_id = CAST(${geoPointIdSql} AS TEXT)
      AND private_decision.action = 'GEO_VISIBILITY_CHANGED'
      AND private_decision.actor_type = 'ADMIN'
      AND private_decision.to_status = 'SKIPPED'
  )`;
}

/** The most recent matching decision, including the original id DESC tie-breaker. */
export function latestGoogleMapsActionSql(
  subjectIdSql: "g.id" | "o.id",
  resourceType: "GEO_POINT" | "HELP_ORGANIZATION",
): string {
  return `(
    SELECT map_decision.action FROM moderation_events map_decision
    WHERE map_decision.resource_type = '${resourceType}'
      AND map_decision.subject_id = CAST(${subjectIdSql} AS TEXT)
      AND map_decision.action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
    ORDER BY map_decision.created_at DESC, map_decision.id DESC
    LIMIT 1
  )`;
}
