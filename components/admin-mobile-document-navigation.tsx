"use client";

import { useEffect } from "react";

/**
 * iOS/mobile admin recovery: client-side Next.js transitions can preserve a
 * stale RSC router tree when moving into the streamed workspace or article list
 * after a deployment. Navigate these two routes with a fresh document instead.
 *
 * Capture applies to *all* admin links (drawer, breadcrumbs, quick links), not
 * just the sidebar. Desktop navigation remains client-side and fast.
 */
export function AdminMobileDocumentNavigation() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        !window.matchMedia("(max-width: 820px)").matches ||
        !(event.target instanceof Element)) return;

      const anchor = event.target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")) return;

      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin ||
        (target.pathname !== "/admin" && target.pathname !== "/admin/clanky")) return;

      // Preserve native back/forward history, query parameters, and no-JS links.
      event.preventDefault();
      window.location.assign(target.href);
    };

    // Capture precedes Next Link's bubble handler so it cannot race the
    // full-document navigation on Safari/iOS.
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
