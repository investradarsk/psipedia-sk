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
 * Original banner images from Dognet. Never rebuild a merchant ad from
 * custom text, colors or logos; use only the publisher-provided <img> src.
 * Different image aspect ratios must not be cropped.
 *
 * ABC-ZOO: original image URLs were supplied as Dognet embed HTML.
 * Zoohit: legacy original GIF sources were already in DognetTestBanner.
 * Fera: no confirmed original image URL yet, so it remains excluded.
 */
export type AffiliateBannerFormat = AffiliateBannerPlacement | "mobile";
export type OriginalAffiliateCreative = {
  src: string;
  width: number;
  height: number;
};

export const AFFILIATE_BANNER_ORIGINAL_CREATIVES: Partial<
  Record<(typeof AFFILIATE_BANNER_PARTNERS)[number]["id"], Partial<Record<AffiliateBannerFormat, readonly OriginalAffiliateCreative[]>>>
> = {
  zoohit: {
    horizontal: [{
      src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/3a047bf8.gif",
      width: 468,
      height: 60,
    }],
    sidebar: [{
      src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/8cfd4fa0.gif",
      width: 120,
      height: 600,
    }],
  },
  "abc-zoo": {
    mobile: [{
      src: "https://api.app.dognet.com/files/t/a4f/a4f633806f17fbe0b73988aa2f02eadd1eef84f1.png",
      width: 1080,
      height: 1080,
    }],
    sidebar: [{
      src: "https://api.app.dognet.com/files/t/00f/00fd437025798c026a889b20e1f19ec0f6bf45f8.png",
      width: 1080,
      height: 1350,
    }, {
      src: "https://api.app.dognet.com/files/t/027/027698d3980d5d99f5d9dab9e67530ead4c2cbcd.png",
      width: 1080,
      height: 1920,
    }],
  },
};

export function getAvailableAffiliateOriginalBanners(placement: AffiliateBannerFormat) {
  const formats: readonly AffiliateBannerFormat[] =
    placement === "sidebar" ? ["sidebar", "mobile"] : [placement];
  return AFFILIATE_BANNER_PARTNERS.flatMap((partner) =>
    formats.flatMap((format) =>
      (AFFILIATE_BANNER_ORIGINAL_CREATIVES[partner.id]?.[format] ?? []).map((creative) => ({
        ...partner,
        creative,
      })),
    ),
  ).filter(({ creative }) => creative.width > 0 && creative.height > 0 && (
    placement === "horizontal" ? creative.width > creative.height :
    placement === "mobile" ? creative.width === creative.height :
    creative.width <= creative.height && creative.height <= creative.width * 1.5
  ));
}

/** Retry only compatible originals, exactly once; never cross placement formats. */
export function getAffiliateBannerCandidates(format: AffiliateBannerFormat, selectedIndex: number) {
  const primary = getAvailableAffiliateOriginalBanners(format);
  const ordered = [...primary.slice(selectedIndex), ...primary.slice(0, selectedIndex)];
  const seen = new Set<string>();
  return ordered.filter(({ creative }) => {
    if (seen.has(creative.src)) return false;
    seen.add(creative.src);
    return true;
  });
}

// The owner wants affiliate inventory across the public site and partner area.
// Keep internal administration and non-page API routes ad-free.
export function canShowGlobalAffiliateBanner(pathname: string | null | undefined) {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return !["/admin", "/api"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
