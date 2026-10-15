/**
 * Public visibility and admin presentation share one effective lifecycle gate.
 * Stored D1 status remains authoritative for writes, Notion import and CAS.
 * Never change persisted status or published_at when computing this view.
 */
export type ArticleLifecycleStatus = "draft" | "scheduled" | "published";

export function effectiveArticleStatus(
  status: ArticleLifecycleStatus,
  publishedAt: string | null | undefined,
  now: string | number | Date = Date.now(),
): ArticleLifecycleStatus {
  if (status !== "scheduled" || !publishedAt) return status;
  const due = Date.parse(publishedAt);
  const clock = now instanceof Date ? now.getTime()
    : typeof now === "string" ? Date.parse(now) : now;
  return Number.isFinite(due) && Number.isFinite(clock) && due <= clock
    ? "published" : "scheduled";
}

/**
 * SQL equivalent of effectiveArticleStatus. SQL callers bind the ISO UTC
 * snapshot as the first parameter for every occurrence of this expression.
 * Keep parameterized comparison rather than interpolating a clock value.
 */
export function articleEffectiveStatusSql(
  statusColumn = "status",
  publishedAtColumn = "published_at",
) {
  return `CASE WHEN ${statusColumn} = 'scheduled'
    AND ${publishedAtColumn} IS NOT NULL
    AND ${publishedAtColumn} <= ? THEN 'published'
    ELSE ${statusColumn} END`;
}

export function articleEffectiveStatusLabel(status: ArticleLifecycleStatus) {
  return status === "published" ? "Publikovaný"
    : status === "scheduled" ? "Naplánovaný" : "Koncept";
}
