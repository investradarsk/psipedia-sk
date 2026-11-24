/** Single canonical D1 mutation. Every authorization predicate is evaluated
 * at write time, so revocation, resolution and parallel edits cannot race.
 * Identifiers are fixed server-side; all input values are bound separately.
 */
export const PARTNER_LOST_FOUND_RESOLVE_SQL =
  "UPDATE lost_found_dog_reports SET status='RESOLVED',resolved_at=?1,updated_at=?1 "+
  "WHERE id=?2 AND status='ACTIVE' AND published_at IS NOT NULL "+
  "AND duplicate_of_id IS NULL AND updated_at=?3 "+
  "AND (expires_at IS NULL OR expires_at>?4) "+
  "AND EXISTS (SELECT 1 FROM partner_help_claims c "+
  "JOIN partner_accounts a ON a.id=c.account_id AND a.status='ACTIVE' "+
  "WHERE c.lost_found_report_id=?2 AND c.entity_type='LOST_FOUND_DOG' "+
  "AND c.account_id=?5 AND c.status='APPROVED')";
