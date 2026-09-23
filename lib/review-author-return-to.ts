export const REVIEW_AUTHOR_RETURN_TO_MAX_LENGTH = 1000;

export function normalizeReviewAuthorReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > REVIEW_AUTHOR_RETURN_TO_MAX_LENGTH) return null;
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.includes("\\")) return null;
  if (/[\u0000-\u001F\u007F]/.test(clean)) return null;

  let parsed: URL;
  try {
    parsed = new URL(clean, "https://psipedia.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://psipedia.invalid") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  const isDirectoryProfile = segments.length === 3
    && segments[0] === "adresar"
    && segments.slice(1).every((part) => /^[a-z0-9-]+$/.test(part));
  const isOrganizationProfile = segments.length === 2
    && segments[0] === "organizacie"
    && /^[a-z0-9-]+$/.test(segments[1]);
  if (!isDirectoryProfile && !isOrganizationProfile) return null;

  const search = new URLSearchParams();
  const reviewsPage = parsed.searchParams.get("reviewsPage");
  if (reviewsPage && /^[1-9]\d{0,5}$/.test(reviewsPage)) search.set("reviewsPage", reviewsPage);
  const hash = parsed.hash === "#recenzie" ? "#recenzie" : "";
  const query = search.toString();
  return parsed.pathname + (query ? "?" + query : "") + hash;
}

export function reviewAuthorAuthHref(returnTo: string) {
  const safe = normalizeReviewAuthorReturnTo(returnTo);
  return safe ? "/recenzia/prihlasenie?returnTo=" + encodeURIComponent(safe) : "/recenzia/prihlasenie";
}
