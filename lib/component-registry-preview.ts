/**
 * Paths for the visual component registry preview must remain same-origin
 * public pages. Admin, API and dynamic route templates cannot be embedded.
 */
export function safeComponentPreviewPath(input: string): string | null {
  const candidate = input.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") ||
      /[\u0000-\u001f\u007f?#]/.test(candidate)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") ||
      /[\u0000-\u001f\u007f?#]/.test(decoded) || decoded.includes("[") || decoded.includes("]") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..") ||
      /\/{2,}/.test(decoded)) return null;
  if (/^\/(?:admin|api|_next)(?:\/|$)/i.test(decoded)) return null;
  return candidate;
}

export function staticPublicComponentRoutes(routes: readonly string[]): string[] {
  return [...new Set(routes)]
    .filter((route) => safeComponentPreviewPath(route) === route)
    .sort();
}

export function hasDynamicPublicComponentRoute(routes: readonly string[]): boolean {
  return routes.some((route) => route.startsWith("/") &&
    !/^\/(?:admin|api|_next)(?:\/|$)/i.test(route) &&
    /\[[^\]]+\]/.test(route));
}
