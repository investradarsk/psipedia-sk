/**
 * CAS guard for an explicit Admin review-state change.
 *
 * D1.batch executes statements in one transaction. The profile revision
 * UPDATE must affect exactly one row before its SQL review record is changed;
 * a failed revision check aborts the entire batch.
 */
export function directory0173ReviewCasGuardStatement(database: D1Database): D1PreparedStatement {
  return database.prepare(
    "SELECT CASE WHEN changes()=1 THEN 1 " +
    "ELSE json_extract('DIRECTORY_REVIEW_CAS_CONFLICT', char(36)) END AS cas_accepted",
  );
}
