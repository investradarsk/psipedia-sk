/**
 * Partner destinations copied from the owner's Dognet banners (channel PW4rE4bS).
 * These are tracked links, not creative-image URLs.
 */
export const AFFILIATE_BANNER_PARTNERS = [
  {
    id: "zoohit",
    name: "Zoohit.sk",
    title: "Všetko, čo potrebuje váš pes",
    description: "Krmivo, maškrty a výbava pre psov.",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Fwww.zoohit.sk%2F",
  },
  {
    id: "abc-zoo",
    name: "ABC-ZOO.sk",
    title: "Výbava na každý deň so psom",
    description: "Krmivo, hračky a potreby pre psov.",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Fabc-zoo.sk%2F",
  },
  {
    id: "fera",
    name: "Fera.sk",
    title: "Starostlivosť aj zábava pre psov",
    description: "Krmivo, maškrty a doplnky pre psov.",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Ffera.sk%2F",
  },
] as const;

export type AffiliateBannerPlacement = "horizontal" | "sidebar";

const PRIVATE_PREFIXES = [
  "/admin",
  "/partner",
  "/api",
  "/overenie-profilu",
  "/odhlasenie-osloveni",
  "/recenzia/prihlasenie",
  "/recenzia/overenie",
  "/recenzia/napisat",
  "/novinky/poslat-tip",
  "/pomoc-psom/stratene-a-najdene/nahlasit",
] as const;

const EXCLUDED_PUBLIC_PAGES = new Set([
  "/cookies",
  "/pravne-informacie",
  "/sukromie",
  "/podmienky-pouzivania",
  "/zasady-obsahu",
  "/opravy-a-podnety",
]);

export function canShowGlobalAffiliateBanner(pathname: string | null | undefined) {
  if (!pathname || !pathname.startsWith("/")) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (EXCLUDED_PUBLIC_PAGES.has(path)) return false;
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
  // Publicly reachable forms for editing profiles and reviews are not ad inventory.
  if (/^\/adresar\/[^/]+\/[^/]+\/upravit(?:\/|$)/.test(path)) return false;
  if (/^\/recenzie\/eshopy\/[^/]+\/hodnotit(?:\/|$)/.test(path)) return false;
  return true;
}

export function nextAffiliateRotation(current: number | null | undefined) {
  const length = AFFILIATE_BANNER_PARTNERS.length;
  if (current == null || !Number.isSafeInteger(current) || current < 0) {
    return { selected: 0, next: 1 % length };
  }
  const selected = current % length;
  return { selected, next: (selected + 1) % length };
}
