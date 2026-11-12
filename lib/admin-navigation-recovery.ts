/**
 * Validate recovery destinations without ever converting them into an unsafe
 * external navigation or leaking authenticated admin routes to another origin.
 * Recovery opens in a new tab by user choice; it never reloads a dirty editor.
 */
export const ADMIN_NAVIGATION_START_EVENT = "psipedia:admin-navigation-start";
export const ADMIN_NAVIGATION_STALL_MS = 12_000;

export type AdminNavigationType = "push" | "replace" | "traverse";
export type AdminNavigationStartDetail = {
  href: string;
  navigationType: AdminNavigationType;
};

export function adminNavigationTarget(href: string, currentUrl: string): string | null {
  try {
    const current = new URL(currentUrl);
    const target = new URL(href, current);
    if ((target.protocol !== "http:" && target.protocol !== "https:") ||
      target.origin !== current.origin ||
      (target.pathname !== "/admin" && !target.pathname.startsWith("/admin/"))) return null;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}
