/** Bounded, deterministic visible page numbers for public listings. */
export function publicPaginationPages(currentPage: number, totalPages: number): number[] {
  const total = Number.isFinite(totalPages) ? Math.max(1, Math.trunc(totalPages)) : 1;
  const page = Number.isFinite(currentPage) ? Math.min(total, Math.max(1, Math.trunc(currentPage))) : 1;
  const candidates = [1, page - 1, page, page + 1, total];
  if (page <= 2) candidates.push(2, 3);
  if (page >= total - 1) candidates.push(total - 1, total - 2);
  return [...new Set(candidates.filter(value => value >= 1 && value <= total))]
    .sort((left, right) => left - right);
}
