/**
 * Rotate homepage recommendations by Bratislava calendar day.
 * Each day starts at the next batch, and the database wraps at the end.
 * No scheduler, random per-request ordering or new database state is needed.
 */
export function homepageRotationOffset(dateKey: string, batchSize: number): number {
  const day = Date.parse(`${dateKey}T00:00:00Z`);
  return Math.floor(day / 86_400_000) * batchSize;
}

/** Mirror the SQL wrapped-window selection for preview data without a D1 binding. */
export function homepageRotatingWindow<T>(
  rows: readonly T[],
  offset: number,
  limit: number,
): T[] {
  if (!rows.length || limit <= 0) return [];
  const start = ((offset % rows.length) + rows.length) % rows.length;
  return Array.from(
    { length: Math.min(limit, rows.length) },
    (_, index) => rows[(start + index) % rows.length]!,
  );
}
