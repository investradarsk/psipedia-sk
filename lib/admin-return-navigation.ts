/**
 * Explicit return address from an admin listing. Never follow arbitrary paths:
 * the parameter is untrusted even when it originates from one of our links.
 */
export function adminDetailHref(detailHref: string, listHref: string): string {
  const [path, fragment] = detailHref.split("#", 2);
  const params = new URLSearchParams();
  params.set("returnTo", listHref);
  return path + (path.includes("?") ? "&" : "?") + params.toString() + (fragment ? "#" + fragment : "");
}

export function adminReturnHref(value: string | string[] | undefined, listing: string | readonly string[]): string {
  const allowed = typeof listing === "string" ? [listing] : listing;
  const fallback = allowed[0] ?? "/admin";
  const candidate = typeof value === "string" ? value : "";
  if (!candidate || candidate.length > 2048 || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f]/.test(candidate)) return fallback;
  try {
    const parsed = new URL(candidate, "https://admin.invalid");
    if (parsed.origin !== "https://admin.invalid" || !allowed.includes(parsed.pathname) || parsed.hash || parsed.username || parsed.password) return fallback;
    return parsed.pathname + parsed.search;
  } catch {
    return fallback;
  }
}
