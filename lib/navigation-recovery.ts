/**
 * Recovery UI for accepted public/Partner router transitions. It never
 * cancels requests, changes history or replays a mutation.
 */
import { NAVIGATION_MAX_WAIT_MS } from "./navigation-progress.ts";

type Area = "public" | "partner" | "excluded";

function area(path: string): Area {
  // Reject ambiguous encoded paths and non-document endpoints.
  if (path.startsWith("//") || /%2f|%5c/i.test(path) || /\.rsc$/i.test(path)) {
    return "excluded";
  }
  if (["/admin", "/api", "/_next", "/cdn-cgi"].some(
    (prefix) => path === prefix || path.startsWith(prefix + "/"),
  )) return "excluded";
  if (path === "/partner" || path.startsWith("/partner/")) return "partner";
  return "public";
}

export function safeNavigationRecoveryTarget(href: string, currentHref: string): string | null {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (!/^https?:$/.test(target.protocol) || target.origin !== current.origin ||
      target.username || target.password || area(current.pathname) === "excluded" ||
      area(target.pathname) !== area(current.pathname)) return null;
    if (target.pathname === current.pathname && target.search === current.search) return null;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}

export function createNavigationRecovery() {
  let target: string | null = null;
  let visible: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();

  function publish(next: string | null) {
    if (visible === next) return;
    visible = next;
    for (const listener of listeners) listener();
  }

  function clear() {
    generation++;
    clearTimeout(timer);
    target = null;
    publish(null);
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot: () => visible,
    begin(href: string, currentHref: string) {
      clear();
      target = safeNavigationRecoveryTarget(href, currentHref);
      if (!target) return;
      const token = generation;
      timer = setTimeout(() => {
        if (token === generation) publish(target);
      }, NAVIGATION_MAX_WAIT_MS);
    },
    clear,
  };
}

export const navigationRecovery = createNavigationRecovery();
