"use client";

type Props = {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
};

/** Client-side paging applies only after the parent filters its full list. */
export function AdminCommunityPagination({ total, page, onPageChange, pageSize = 20 }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return (
    <nav aria-label="Stránkovanie záznamov" data-admin-community-pagination data-admin-list-pagination>
      <span role="status" aria-live="polite" aria-atomic="true">Nájdené: {total} · Strana {current} z {pages}</span>
      <button type="button" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>Predchádzajúca</button>
      <button type="button" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>Nasledujúca</button>
    </nav>
  );
}

export const COMMUNITY_PAGE_SIZE = 20;
