/** Only the public pathname is admissible in anonymous sitewide view counts. */
export function isSafeSiteAnalyticsPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 220 || !/^\/[A-Za-z0-9._~/-]*$/.test(path)) {
    return false;
  }
  if (path.includes("//") || path.split("/").some((part) => part === ".." || part === ".")) {
    return false;
  }
  if (/\/%2f|\/%5c/i.test(path)) return false;
  const first = path.split("/")[1]?.toLowerCase() ?? "";
  return !["admin", "partner", "api", "_next", "recenzia", "favicon.ico"].includes(first);
}
