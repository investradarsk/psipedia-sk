/** Static public page routes only; never fabricate dynamic profile URLs. */
export function publicRegistryRouteHref(route: string): string | null {
  if (!new RegExp("^/[A-Za-z0-9/_-]*$").test(route)) return null;
  if (route === "/admin" || route.startsWith("/admin/")) return null;
  if (route.includes("//")) return null;
  return route;
}
