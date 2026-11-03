/**
 * Audited identity of the underlying PUBLIC React renderer.
 *
 * Distinct copy, photos or layout presets are not proof of duplicate code.
 * This table records only explicit call chains verified in source:
 *
 *  - PublicHelpPhotoBanner -> PublicPhotoCallout -> PublicMagazineBanner
 *  - PublicHelpClosingBanner -> PublicPhotoCallout -> PublicMagazineBanner
 *  - PublicPhotoCallout -> PublicMagazineBanner
 *  - Article / homepage / breed promos -> PublicMagazineBanner
 *
 * These names are existing owner-gallery group IDs. They remain stable so
 * previously saved A/B decisions retain their original identity.
 */
export type VerifiedCanonicalRenderer = {
  name: string;
  path: string;
  /**
   * Concrete code-level evidence, NOT a claim of DOM/screenshot coverage for
   * every dynamic public URL.
   */
  chain: readonly string[];
};

const MAGAZINE: VerifiedCanonicalRenderer = {
  name: "PublicMagazineBanner",
  path: "components/public-visual-system/public-magazine-banner.tsx",
  chain: ["PublicMagazineBanner"],
};

export const VERIFIED_CANONICAL_RENDERERS: Readonly<Record<string, VerifiedCanonicalRenderer>> = {
  magazine: MAGAZINE,
  rescue: {
    ...MAGAZINE,
    chain: ["PublicHelpPhotoBanner", "PublicPhotoCallout", "PublicMagazineBanner"],
  },
  closing: {
    ...MAGAZINE,
    chain: ["PublicHelpClosingBanner", "PublicPhotoCallout", "PublicMagazineBanner"],
  },
  "photo-callout": {
    ...MAGAZINE,
    chain: ["PublicPhotoCallout", "PublicMagazineBanner"],
  },
};

export function verifiedCanonicalRendererForGroup(
  id: string,
): VerifiedCanonicalRenderer | null {
  return Object.prototype.hasOwnProperty.call(VERIFIED_CANONICAL_RENDERERS, id)
    ? VERIFIED_CANONICAL_RENDERERS[id] : null;
}

export function ownerGroupsAlreadyShareRenderer(leftId: string, rightId: string): boolean {
  if (leftId === rightId) return true;
  const left = verifiedCanonicalRendererForGroup(leftId);
  const right = verifiedCanonicalRendererForGroup(rightId);
  return Boolean(left && right && left.name === right.name && left.path === right.path);
}
