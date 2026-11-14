/** Only the public pathname is admissible in anonymous sitewide view counts. */
export function isSafeSiteAnalyticsPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 220 || !/^\/[A-Za-z0-9._~/-]*$/.test(path)) {
    return false;
  }
  if (path.includes("//") || path.split("/").some((part) => part === ".." || part === ".")) {
    return false;
  }
  if (/\/%2f|\/%5c/i.test(path)) return false;
  // Test-only E2E fixtures are not real public content. Do not collect them
  // even if a production smoke test deliberately visits a 404 route.
  if (path.split("/").some((segment) => /(?:^e2e$|-e2e$)/i.test(segment))) return false;
  const first = path.split("/")[1]?.toLowerCase() ?? "";
  return !["admin", "partner", "api", "_next", "recenzia", "favicon.ico"].includes(first);
}
