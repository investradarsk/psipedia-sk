import { ARTICLE_READ_COOLDOWN_MS } from "@/lib/article-read-tracking";

/** A random one-profile event token expires after the same 6h cooldown as articles. */
export const PROFILE_VIEW_COOLDOWN_MS = ARTICLE_READ_COOLDOWN_MS;
const PROFILE_VIEW_STORAGE_PREFIX = "psipedia-profile-view:v1:";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VisitStorage = Pick<Storage, "getItem" | "setItem">;

export function profileViewStorageKey(profileId: number) {
  return `${PROFILE_VIEW_STORAGE_PREFIX}${profileId}`;
}

/**
 * Reserve a single qualifying view for one profile in this browser.
 * The random token exists only for this profile and six-hour window;
 * there is no cross-profile visitor identifier, IP or fingerprint.
 *
 * If storage is blocked we skip measurement rather than inflate counts.
 * Repeated direct POSTs with the same token are deduplicated on the server.
 */
export function reserveQualifiedProfileView(
  storage: VisitStorage,
  profileId: number,
  nowMs: number,
  randomUUID: () => string = () => crypto.randomUUID(),
): string | null {
  if (!Number.isSafeInteger(profileId) || profileId < 1 || !Number.isFinite(nowMs)) return null;
  try {
    const key = profileViewStorageKey(profileId);
    const saved = storage.getItem(key);
    if (saved) {
      const prior = JSON.parse(saved) as { at?: unknown; token?: unknown };
      if (
        typeof prior.at === "number"
        && Number.isFinite(prior.at)
        && typeof prior.token === "string"
        && UUID_V4.test(prior.token)
        && nowMs >= prior.at
        && nowMs - prior.at < PROFILE_VIEW_COOLDOWN_MS
      ) return null;
    }
    const token = randomUUID();
    if (!UUID_V4.test(token)) return null;
    storage.setItem(key, JSON.stringify({ at: nowMs, token }));
    return token;
  } catch {
    return null;
  }
}

export async function sendQualifiedProfileView(
  profileId: number,
  profileSlug: string,
  visitToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  try {
    await fetchImpl("/api/directory/views", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ profileId, profileSlug, visitToken }),
    });
  } catch {
    // Analytics must never interrupt profile viewing.
  }
}
