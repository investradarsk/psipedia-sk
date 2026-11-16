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
    <nav aria-label="Stránkovanie záznamov" data-admin-community-pagination
      style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: ".75rem", flexWrap: "wrap", padding: ".75rem 0" }}>
      <span role="status" style={{ marginRight: "auto" }}>Nájdené: {total} · Strana {current} z {pages}</span>
      <button type="button" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>Predchádzajúca</button>
      <button type="button" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>Nasledujúca</button>
    </nav>
  );
}

export const COMMUNITY_PAGE_SIZE = 20;
