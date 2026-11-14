/** Shared consent guard for Psipedia's first-party qualified-read analytics. */
export const QUALIFIED_ANALYTICS_CONSENT_KEY = "psipedia-cookie-consent";
export const QUALIFIED_ANALYTICS_CONSENT_EVENT = "psipedia:consent-changed";

const FIRST_PARTY_TRACKING_PREFIXES = [
  "psipedia-article-read:v1:",
  "psipedia-profile-view:v1:",
] as const;

/**
 * The existing cookie banner stores the user's explicit analytics selection.
 * Unknown, necessary-only, inaccessible and missing values all fail closed.
 */
export function hasQualifiedAnalyticsConsent(
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    const choice = storage.getItem(QUALIFIED_ANALYTICS_CONSENT_KEY);
    return choice === "analytics" || choice === "advertising";
  } catch {
    return false;
  }
}

/**
 * On withdrawal remove only first-party popularity cooldown state. Never
 * erase unrelated favorites, site settings, auth or internal-traffic flags.
 */
export function clearQualifiedAnalyticsStorage(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && FIRST_PARTY_TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Hardened browsers may block storage operations.
  }
}
