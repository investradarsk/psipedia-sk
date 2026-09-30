export const INTERNAL_TRAFFIC_STORAGE_KEY = "psipedia-internal-traffic";
export const INTERNAL_TRAFFIC_COOKIE_NAME = "psipedia_internal";
export const INTERNAL_TRAFFIC_QUERY_PARAM = "internal";
export const INTERNAL_TRAFFIC_EVENT = "psipedia:internal-traffic-changed";

export function parseInternalTrafficOverride(value: string | null): boolean | null {
  if (value === null) return null;

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "on":
      return true;
    case "0":
    case "false":
    case "off":
      return false;
    default:
      return null;
  }
}

export function isStoredInternalTraffic(value: string | null): boolean {
  return value === "1";
}


export function hasInternalTrafficCookie(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "")
    .split(";")
    .some((cookie) => cookie.trim() === `${INTERNAL_TRAFFIC_COOKIE_NAME}=1`);
}

export function isInternalTrafficRequest(request: Pick<Request, "headers">): boolean {
  return hasInternalTrafficCookie(request.headers.get("cookie"));
}
