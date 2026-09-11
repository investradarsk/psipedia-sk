/** UI state only: never intercepts navigation, history, fetch, or router methods. */
export const NAVIGATION_MAX_WAIT_MS = 12_000;
export const NAVIGATION_MIN_VISIBLE_MS = 180;

export function routeKey(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    const origin = new URL(base).origin;
    return /^https?:$/.test(url.protocol) && url.origin === origin ? url.pathname + url.search : null;
  } catch { return null; }
}

export type NavigationClick = {
  button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
  defaultPrevented: boolean;
};

export function eligibleNavigationClick(event: NavigationClick, link: { href: string; target: string; download: boolean }, current: string) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (link.download || (link.target && link.target.toLowerCase() !== "_self")) return false;
  const target = routeKey(link.href, current);
  return target !== null && target !== routeKey(current, current);
}

export function createNavigationProgress() {
  let active = false;
  let generation = 0;
  let startedAt = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let completion: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function setActive(value: boolean) {
    if (value === active) return;
    active = value;
    listeners.forEach((listener) => listener());
  }
  function reset() {
    generation++;
    clearTimeout(timeout);
    clearTimeout(completion);
    setActive(false);
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => active,
    begin() {
      const token = ++generation;
      clearTimeout(timeout);
      clearTimeout(completion);
      if (!active) startedAt = Date.now();
      setActive(true);
      // A cancelled transition with no route commit must never leave permanent UI.
      timeout = setTimeout(() => { if (token === generation) reset(); }, NAVIGATION_MAX_WAIT_MS);
      return token;
    },
    complete(token = generation) {
      if (!active || token !== generation) return;
      clearTimeout(completion);
      completion = setTimeout(() => { if (token === generation) reset(); }, Math.max(0, NAVIGATION_MIN_VISIBLE_MS - (Date.now() - startedAt)));
    },
    reset,
  };
}

export const navigationProgress = createNavigationProgress();
