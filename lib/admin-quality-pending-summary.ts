/**
 * Count-only read model for the Admin homepage quality metric.
 *
 * The full /admin/kvalita page needs proposals (up to 1000) and scan history,
 * while the homepage renders only the total number of OPEN suggestions.
 * Keep this reader independent of the Tavily discovery/import module.
 */
export async function loadAdminQualityPendingSummary(
  db: Pick<D1Database, "prepare"> | undefined,
): Promise<{total: number; schemaReady: boolean}> {
  if (!db) throw new Error("Chýba databáza Kvality údajov.");

  // Same migration-readiness behavior as loadMissingQualityDashboard:
  // an absent status/error_code schema is unavailable, never an empty list.
  try {
    await db.prepare("SELECT status,error_code FROM quality_missing_scans LIMIT 1").all();
  } catch (error) {
    if (/no such (table|column):/i.test(String(error))) {
      return {total: 0, schemaReady: false};
    }
    throw error;
  }

  const row = await db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'")
    .first<{n: number}>();
  return {total: Number(row?.n ?? 0), schemaReady: true};
}
