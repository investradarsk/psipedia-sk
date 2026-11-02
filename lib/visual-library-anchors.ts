/**
 * Stable, DOM-safe anchors for visual-library links.
 * Names are based on the content block id, never on array position. Hence
 * reordering blocks does not break an already shared placement link.
 */
export function articlePromoBlockAnchor(blockId: string): string {
  const slug = blockId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 72) || "block";
  let hash = 2166136261;
  for (let index = 0; index < blockId.length; index++) {
    hash ^= blockId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `psipedia-promo-${slug}-${(hash >>> 0).toString(16)}`;
}

export const AUTOMATIC_ARTICLE_PROMO_ANCHOR = "psipedia-article-promo-auto";
export const ARTICLE_LISTING_PROMO_ANCHOR = "psipedia-article-listing-promo";
export const HOME_PROFILE_BANNER_ANCHOR = "psipedia-banner-home-profile";
export const BREED_CLUBS_BANNER_ANCHOR = "psipedia-banner-breed-clubs";
export const HELP_LOST_FOUND_BANNER_ANCHOR = "psipedia-banner-help-lost-found";
export const HELP_CLOSING_BANNER_ANCHOR = "psipedia-banner-help-closing";
export function helpOverviewBannerAnchor(index: number): string {
  return `psipedia-banner-help-section-${index}`;
}
export const HERO_BREEDS_ANCHOR = "psipedia-hero-breeds";
export const HERO_ARTICLES_ANCHOR = "psipedia-hero-articles";
export const CTA_DIRECTORY_MAP_ANCHOR = "psipedia-cta-directory-map";
export const CTA_HELP_ORGANIZATIONS_ANCHOR = "psipedia-cta-help-organizations";
export function articleListCardAnchor(slug: string) {
  return articlePromoBlockAnchor(`article-list:${slug}`);
}
