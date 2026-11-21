/**
 * Affiliate placements are for editorial/public reading surfaces only.
 * Never display them in partner/admin workspaces, auth flows or submission forms.
 */
const HIDDEN_PATH_PREFIXES = [
  "/admin",
  "/partner",
  "/api",
  "/recenzia/prihlasenie",
  "/recenzia/overenie",
  "/recenzia/napisat",
  "/overenie-profilu",
  "/odhlasenie-osloveni",
  "/novinky/poslat-tip",
  "/pomoc-psom/stratene-a-najdene/nahlasit",
] as const;

const HIDDEN_EXACT_PATHS = new Set([
  "/cookies",
  "/pravne-informacie",
  "/sukromie",
  "/podmienky-pouzivania",
  "/zasady-obsahu",
  "/opravy-a-podnety",
]);

export function shouldShowSitewideDognetBanner(pathname: string | null | undefined) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  const path = pathname.replace(/\/+$/, "") || "/";

  if (HIDDEN_EXACT_PATHS.has(path)) return false;
  if (HIDDEN_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;

  // Editing a directory listing belongs to the owner workflow, not the public profile.
  if (/^\/adresar\/[^/]+\/[^/]+\/upravit(?:\/|$)/.test(path)) return false;

  return true;
}
