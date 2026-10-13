/**
 * R2 images may be shared by the article hero, its Open Graph preview and
 * inline blocks. A removed reference must not delete a still-referenced key.
 */
export function orphanedArticleMediaKeys(
  previous: ReadonlyArray<string | null | undefined>,
  current: ReadonlyArray<string | null | undefined>,
): string[] {
  const active = new Set(current.filter((key): key is string => Boolean(key)));
  return [...new Set(previous.filter((key): key is string => Boolean(key)))]
    .filter((key) => !active.has(key));
}
