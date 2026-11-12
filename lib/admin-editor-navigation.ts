/** Shared, framework-independent validation for Admin editor navigation. */
export const ADMIN_NAVIGATION_INTENT_EVENT = "psipedia:admin-navigation-intent";

export type AdminNavigationIntent = { href: string; navigate: () => void };

/** Only same-origin path/query changes need a draft-discard confirmation. */
export function isEditorExit(href: string, currentHref: string): boolean {
  try {
    const to = new URL(href, currentHref);
    const from = new URL(currentHref);
    return (to.protocol === "http:" || to.protocol === "https:") &&
      to.origin === from.origin &&
      (to.pathname !== from.pathname || to.search !== from.search);
  } catch {
    return false;
  }
}
