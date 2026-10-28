"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

/**
 * Navigate to the admin home with a fresh document. The admin home is streamed
 * and depends on authenticated, uncached data: an old client-side router state
 * can otherwise leave a blank workspace after moving between admin editors.
 *
 * Keep the real Next Link (and its no-JS fallback) for internal navigation.
 */
export function AdminHomeBrandLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  function navigateToHome(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    event.preventDefault();
    window.location.assign("/admin");
  }

  return (
    <Link
      href="/admin"
      prefetch={false}
      className={className}
      aria-label="Psipedia Admin – pracovný prehľad"
      onClick={navigateToHome}
    >
      {children}
    </Link>
  );
}
