"use client";

import { useEffect } from "react";

const CHROME_IOS = /(?:iPhone|iPad|iPod).*CriOS\//i;
const PRIVATE_PREFIXES = ["/admin", "/partner", "/api"];

function privatePath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

/**
 * Keep ordinary public links in the same Chrome iOS history stack.
 *
 * Next.js Link normally handles clicks through the app's delegated click
 * listener (client-side navigation). On Chrome iOS that history can interact
 * badly with the browser's native page gesture. Only for Chrome on iOS, let
 * the browser follow cross-page anchors as ordinary document navigations.
 *
 * IMPORTANT: do not preventDefault or call history.pushState/replaceState.
 * The browser itself creates the new back/forward entry.
 */
export function NativeHistoryNavigation() {
  useEffect(() => {
    if (!CHROME_IOS.test(window.navigator.userAgent)) return;

    function allowBrowserNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey
        || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)
        || anchor.hasAttribute("download")
        || (anchor.target && anchor.target !== "_self")
        || anchor.hasAttribute("data-native-history-skip")
        || anchor.closest("[data-native-history-skip]")) return;

      // The events calendar intentionally performs client-side month, day,
      // period and category switches without reloading the page. Its actual
      // event cards and day-result details are ordinary page navigation.
      if (anchor.closest("[data-public-calendar]")
        && !anchor.closest("[data-event-card], #vybrany-den li")) return;

      let next: URL;
      try {
        next = new URL(anchor.href);
      } catch {
        return;
      }
      const current = window.location;
      if (next.origin !== current.origin || next.pathname === current.pathname
        || privatePath(current.pathname) || privatePath(next.pathname)) return;

      // Stop Next's delegated SPA click handler without cancelling the link's
      // default action. Browser-managed navigation preserves native history,
      // including the initial homepage and intermediary listing pages.
      event.stopPropagation();
    }

    document.addEventListener("click", allowBrowserNavigation, true);
    document.documentElement.setAttribute("data-native-history-navigation", "chrome-ios");
    return () => {
      document.removeEventListener("click", allowBrowserNavigation, true);
      document.documentElement.removeAttribute("data-native-history-navigation");
    };
  }, []);

  return null;
}
