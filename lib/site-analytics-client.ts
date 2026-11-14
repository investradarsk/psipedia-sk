import { hasQualifiedAnalyticsConsent } from "@/lib/qualified-analytics-consent";
import {
  classifySiteTrafficSource,
  isSafeSiteAnalyticsPath,
  type SiteTrafficSource,
} from "@/lib/site-analytics-public";

const VISITOR_STORAGE_KEY = "psipedia-site-visitor:v1";
const SESSION_STORAGE_KEY = "psipedia-site-session:v1";
const VISITOR_LIFETIME_MS = 30 * 86_400_000;
const SESSION_IDLE_MS = 30 * 60_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientIdentity = { token: string; at: number };
type ClientSession = { token: string; lastSeen: number; source: SiteTrafficSource };

export function reserveSiteAnalyticsVisit(input: {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
  path: string;
  referrer: string;
  origin: string;
  nowMs?: number;
  randomUUID?: () => string;
}) {
  if (!isSafeSiteAnalyticsPath(input.path) || !hasQualifiedAnalyticsConsent(input.localStorage)) return null;
  const nowMs = input.nowMs ?? Date.now();
  const uuid = input.randomUUID ?? (() => crypto.randomUUID());
  if (!Number.isFinite(nowMs)) return null;

  try {
    const read = (raw: string | null) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as ClientIdentity;
        return typeof parsed?.token === "string"
          && UUID_V4.test(parsed.token) && Number.isFinite(parsed.at)
          ? parsed : null;
      } catch {
        return null;
      }
    };

    const previous = read(input.localStorage.getItem(VISITOR_STORAGE_KEY));
    const visitor = previous && nowMs >= previous.at && nowMs - previous.at < VISITOR_LIFETIME_MS
      ? previous
      : { token: uuid(), at: nowMs };
    if (!UUID_V4.test(visitor.token)) return null;

    let oldSession: ClientSession | null = null;
    const rawSession = input.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession) as ClientSession;
        if (
          UUID_V4.test(parsed.token)
          && Number.isFinite(parsed.lastSeen)
          && nowMs >= parsed.lastSeen
          && nowMs - parsed.lastSeen < SESSION_IDLE_MS
        ) oldSession = parsed;
      } catch {
        // Corrupted session state becomes a new anonymous session.
      }
    }

    const session = oldSession ?? {
      token: uuid(), lastSeen: nowMs,
      source: classifySiteTrafficSource(input.referrer, input.origin),
    };
    if (!UUID_V4.test(session.token)) return null;

    // Do not persist a new visitor or session until consent has passed.
    input.localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(visitor));
    input.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...session, lastSeen: nowMs,
    }));
    return {
      path: input.path,
      visitorToken: visitor.token,
      sessionToken: session.token,
      source: session.source,
    };
  } catch {
    return null;
  }
}

export function clearSiteAnalyticsSessionStorage(storage: Pick<Storage, "removeItem">) {
  try { storage.removeItem(SESSION_STORAGE_KEY); }
  catch { /* Storage can be disabled. */ }
}

export async function sendSiteAnalyticsPageview(
  payload: NonNullable<ReturnType<typeof reserveSiteAnalyticsVisit>>,
  fetchImpl: typeof fetch = fetch,
) {
  try {
    await fetchImpl("/api/analytics/pageview", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Optional statistics never interrupt navigating the site.
  }
}
