/** Merchant destinations use the publisher's approved Dognet tracking channel. */
export const AFFILIATE_BANNER_PARTNERS = [
  {
    id: "zoohit",
    name: "Zoohit.sk",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Fwww.zoohit.sk%2F",
  },
  {
    id: "abc-zoo",
    name: "ABC-ZOO.sk",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Fabc-zoo.sk%2F",
  },
  {
    id: "fera",
    name: "Fera.sk",
    href: "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Ffera.sk%2F",
  },
] as const;

export type AffiliateBannerPlacement = "horizontal" | "sidebar";

/**
 * Only genuine, source-verified merchant artwork belongs here.
 * These two originals already exist in the repository's Dognet trial.
 * Dognet banner IDs and tracking links alone are not image URLs.
 *
 * ABC-ZOO / Fera remain excluded until the original image URLs are exported
 * from Dognet and verified, then they can join the rotation automatically.
 */
export type OriginalAffiliateCreative = {
  src: string;
  width: number;
  height: number;
};
export const AFFILIATE_BANNER_ORIGINAL_CREATIVES: Partial<
  Record<(typeof AFFILIATE_BANNER_PARTNERS)[number]["id"], Partial<Record<AffiliateBannerPlacement, OriginalAffiliateCreative>>>
> = {
  zoohit: {
    horizontal: {
      src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/3a047bf8.gif",
      width: 468,
      height: 60,
    },
    sidebar: {
      src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/8cfd4fa0.gif",
      width: 120,
      height: 600,
    },
  },
};

export function getAvailableAffiliateOriginalBanners(placement: AffiliateBannerPlacement) {
  return AFFILIATE_BANNER_PARTNERS.flatMap((partner) => {
    const creative = AFFILIATE_BANNER_ORIGINAL_CREATIVES[partner.id]?.[placement];
    return creative ? [{ ...partner, creative }] : [];
  });
}

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

export function nextAffiliateRotation(current: number | null | undefined, availableCount: number = AFFILIATE_BANNER_PARTNERS.length) {
  const length = Number.isSafeInteger(availableCount) && availableCount > 0
    ? availableCount
    : AFFILIATE_BANNER_PARTNERS.length;
  if (current == null || !Number.isSafeInteger(current) || current < 0) {
    return { selected: 0, next: 1 % length };
  }
  const selected = current % length;
  return { selected, next: (selected + 1) % length };
}
