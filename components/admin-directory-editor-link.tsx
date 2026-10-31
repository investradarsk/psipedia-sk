import type { ReactNode } from "react";

/**
 * A plain anchor keeps canonical profile editing reachable even when the
 * read-first data grid has not hydrated yet (including mobile E2E).
 * The destination is authenticated by its existing admin page.
 */
export function AdminDirectoryEditorLink({
  profileId,
  className,
  children,
}: {
  profileId: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    // This admin transition intentionally requests a fresh document.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={`/admin/adresar/${profileId}`} className={className}>{children}</a>
  );
}
