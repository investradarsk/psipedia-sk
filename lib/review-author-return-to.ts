export const REVIEW_AUTHOR_RETURN_TO_MAX_LENGTH = 1000;

function parseInternalPath(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > REVIEW_AUTHOR_RETURN_TO_MAX_LENGTH) return null;
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.includes("\\")) return null;
  if (/[\u0000-\u001F\u007F]/.test(clean)) return null;

  try {
    const parsed = new URL(clean, "https://psipedia.invalid");
    return parsed.origin === "https://psipedia.invalid" ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeReviewProfileReturnTo(value: unknown): string | null {
  const parsed = parseInternalPath(value);
  if (!parsed) return null;

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

export function normalizeReviewSubmissionReturnTo(value: unknown): string | null {
  const parsed = parseInternalPath(value);
  if (!parsed || parsed.pathname !== "/recenzia/napisat" || parsed.hash) return null;
  const resourceId = parsed.searchParams.get("resourceId")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(resourceId)) return null;
  const allowed = new URLSearchParams({ resourceId });
  if (parsed.searchParams.toString() !== allowed.toString()) return null;
  return "/recenzia/napisat?" + allowed.toString();
}

export function normalizeReviewAuthorReturnTo(value: unknown): string | null {
  return normalizeReviewProfileReturnTo(value) ?? normalizeReviewSubmissionReturnTo(value);
}

export function reviewSubmissionHref(resourceId: string) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(resourceId)) return null;
  return "/recenzia/napisat?resourceId=" + encodeURIComponent(resourceId);
}

export function reviewAuthorAuthHref(returnTo: string) {
  const safe = normalizeReviewAuthorReturnTo(returnTo);
  return safe ? "/recenzia/prihlasenie?returnTo=" + encodeURIComponent(safe) : "/recenzia/prihlasenie";
}
