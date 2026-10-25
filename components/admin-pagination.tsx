import Link from "next/link";
import { adminNumberedPageWindow } from "@/lib/admin-list-query";

export type AdminPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function pageHref(basePath: string, page: number) {
  return page <= 1 ? basePath : `${basePath}${basePath.includes("?") ? "&" : "?"}page=${page}`;
}

export function AdminPagination({ pagination, basePath }: {
  pagination: AdminPaginationState;
  basePath: string;
}) {
  if (pagination.totalPages <= 1) return null;
  const previous = pagination.page - 1;
  const next = pagination.page + 1;

  return (
    <nav className="admin-pagination" aria-label="Stránkovanie zoznamu">
      {pagination.page > 1
        ? <Link href={pageHref(basePath, previous)}>← Predchádzajúca</Link>
        : <span aria-disabled="true">← Predchádzajúca</span>}
      <strong>Strana {pagination.page} z {pagination.totalPages}</strong>
      {pagination.page < pagination.totalPages
        ? <Link href={pageHref(basePath, next)}>Ďalšia →</Link>
        : <span aria-disabled="true">Ďalšia →</span>}
    </nav>
  );
}

/**
 * Numbered link pagination for the existing GET-filtered admin lists.
 * The page URL is owned by each module so changing pages never drops filters.
 * Uses the same seven-page sliding window previously duplicated by both lists.
 */
export function AdminNumberedPagination({
  page,
  totalPages,
  hrefForPage,
  className,
  ariaLabel = "Stránkovanie zoznamu",
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
  className?: string;
  ariaLabel?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={className ?? "admin-pagination"} aria-label={ariaLabel}>
      {page > 1 && <Link href={hrefForPage(page - 1)} aria-label="Predchádzajúca strana">←</Link>}
      {adminNumberedPageWindow(page, totalPages).map((current) => current === page
        ? <span key={current} aria-current="page">{current}</span>
        : <Link key={current} href={hrefForPage(current)} aria-label={`Strana ${current}`}>{current}</Link>)}
      {page < totalPages && <Link href={hrefForPage(page + 1)} aria-label="Nasledujúca strana">→</Link>}
    </nav>
  );
}
