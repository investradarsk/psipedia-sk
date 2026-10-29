/**
 * Per-tab navigation trail used only for the public mobile swipe-back action.
 * Session storage survives a full document navigation but never leaves the
 * tab, unlike browser history which may include Chrome's New Tab page.
 */
export const INTERNAL_ROUTE_TRAIL_KEY = "psipedia:public-route-trail:v1";
const MAX_TRAIL_LENGTH = 32;

function safeRoute(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    [...value].every((char) => char.charCodeAt(0) >= 32) &&
    value.length <= 2048;
}

export function reconcileInternalTrail(trail: readonly string[], route: string): string[] {
  const valid = trail.filter(safeRoute).slice(-MAX_TRAIL_LENGTH);
  if (!safeRoute(route)) return valid;
  if (valid.at(-1) === route) return valid;
  const existing = valid.lastIndexOf(route);
  if (existing !== -1) return valid.slice(0, existing + 1);
  return [...valid, route].slice(-MAX_TRAIL_LENGTH);
}

export function readInternalTrail(storage: Pick<Storage, "getItem">): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(INTERNAL_ROUTE_TRAIL_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(safeRoute).slice(-MAX_TRAIL_LENGTH) : [];
  } catch {
    return [];
  }
}

export function writeInternalTrail(storage: Pick<Storage, "setItem">, trail: readonly string[]): void {
  try {
    storage.setItem(INTERNAL_ROUTE_TRAIL_KEY, JSON.stringify(trail.filter(safeRoute).slice(-MAX_TRAIL_LENGTH)));
  } catch {
    // Private browsing or storage quotas cannot break navigation.
  }
}
