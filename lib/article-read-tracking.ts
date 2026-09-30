import {
  INTERNAL_TRAFFIC_QUERY_PARAM,
  INTERNAL_TRAFFIC_STORAGE_KEY,
  isStoredInternalTraffic,
  parseInternalTrafficOverride,
} from "@/lib/internal-traffic";

export const ARTICLE_READ_QUALIFY_MS = 10_000;
export const ARTICLE_READ_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const ARTICLE_READ_STORAGE_PREFIX = "psipedia-article-read:v1:";

export type ArticleReadClock = {
  visibleAccumulatedMs: number;
  visibleSinceMs: number | null;
  qualified: boolean;
};

type ReadStorage = Pick<Storage, "getItem" | "setItem">;

export function createArticleReadClock(nowMs: number, visible: boolean): ArticleReadClock {
  return { visibleAccumulatedMs: 0, visibleSinceMs: visible ? nowMs : null, qualified: false };
}

export function updateArticleReadClock(
  state: ArticleReadClock,
  nowMs: number,
  visible: boolean,
): ArticleReadClock {
  const elapsed = state.visibleSinceMs === null ? 0 : Math.max(0, nowMs - state.visibleSinceMs);
  const visibleAccumulatedMs = state.visibleAccumulatedMs + elapsed;
  return {
    visibleAccumulatedMs,
    visibleSinceMs: visible ? nowMs : null,
    qualified: state.qualified || visibleAccumulatedMs >= ARTICLE_READ_QUALIFY_MS,
  };
}

export function currentArticleVisibleMs(state: ArticleReadClock, nowMs: number) {
  return state.visibleAccumulatedMs
    + (state.visibleSinceMs === null ? 0 : Math.max(0, nowMs - state.visibleSinceMs));
}

export function articleReadStorageKey(articleSlug: string) {
  return `${ARTICLE_READ_STORAGE_PREFIX}${articleSlug}`;
}

export function articleReadIsCoolingDown(
  storage: ReadStorage,
  articleSlug: string,
  nowMs: number,
  cooldownMs = ARTICLE_READ_COOLDOWN_MS,
) {
  try {
    const raw = storage.getItem(articleReadStorageKey(articleSlug));
    if (!raw) return false;
    const recordedAt = Number(raw);
    if (!Number.isFinite(recordedAt)) return false;
    const age = nowMs - recordedAt;
    return age >= 0 && age < cooldownMs;
  } catch {
    return false;
  }
}

export function markArticleReadCooldown(storage: ReadStorage, articleSlug: string, nowMs: number) {
  try {
    storage.setItem(articleReadStorageKey(articleSlug), String(nowMs));
  } catch {
    // Storage can be unavailable in hardened/private browser modes. Tracking remains best-effort.
  }
}

export function isInternalArticleReadBrowser(storage: Pick<Storage, "getItem">, search: string) {
  const override = parseInternalTrafficOverride(
    new URLSearchParams(search).get(INTERNAL_TRAFFIC_QUERY_PARAM),
  );
  return override ?? isStoredInternalTraffic(storage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY));
}

export async function sendQualifiedArticleRead(articleSlug: string, fetchImpl: typeof fetch = fetch) {
  try {
    await fetchImpl("/api/articles/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ articleSlug }),
    });
  } catch {
    // Popularity analytics must never affect the reading experience.
  }
}
