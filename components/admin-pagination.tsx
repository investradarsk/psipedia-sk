import Link from "next/link";

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
