/**
 * Executes a read-only D1 page query only when the filtered count proves that
 * a page can contain results. Used by public Adresár and Admin Mapy; no cache.
 */
export async function readNonemptyD1Page<Row>(
  total: number,
  load: () => Promise<{ results: Row[] }>,
): Promise<{ results: Row[] }> {
  if (total === 0) return { results: [] };
  return load();
}
