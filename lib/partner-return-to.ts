export const PARTNER_RETURN_TO_MAX_LENGTH = 1000;

export function normalizePartnerReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > PARTNER_RETURN_TO_MAX_LENGTH) return null;
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.includes("\\")) return null;
  if (/[\u0000-\u001F\u007F]/.test(clean)) return null;

  let parsed: URL;
  try {
    parsed = new URL(clean, "https://psipedia.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://psipedia.invalid") return null;
  if (!parsed.pathname.startsWith("/")) return null;
  if (
    parsed.pathname === "/admin" || parsed.pathname.startsWith("/admin/") ||
    parsed.pathname === "/api" || parsed.pathname.startsWith("/api/") ||
    parsed.pathname.startsWith("/_")
  ) return null;
  return parsed.pathname + parsed.search + parsed.hash;
}

export function partnerAuthHref(path: "/partner/prihlasenie" | "/partner/registracia", returnTo: string | null) {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}
