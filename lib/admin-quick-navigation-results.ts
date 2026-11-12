/** Stable, linear merge of sidebar destinations and live admin search hits.
 * Sidebar wins duplicate paths; no destination semantics change.
 */
export function mergeUniqueAdminDestinations<T extends { href: string }>(
  sections: readonly T[],
  records: readonly T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of [...sections, ...records]) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    unique.push(item);
  }
  return unique;
}
