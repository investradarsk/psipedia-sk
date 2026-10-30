"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

/**
 * Canonical directory editors depend on several uncached D1-backed reads.
 * Open them with a real document navigation instead of reusing a potentially
 * stale App Router transition from the client-side sortable admin grid.
 *
 * Preserve normal middle-click, open-in-new-tab and modified-click behavior.
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
  const href = `/admin/adresar/${profileId}`;
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    event.preventDefault();
    window.location.assign(href);
  };

  return <Link href={href} className={className} prefetch={false} onClick={navigate}>{children}</Link>;
}
