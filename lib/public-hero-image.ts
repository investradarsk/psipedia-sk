import { responsiveMediaSrcSet } from "./responsive-media.ts";

// The bundled homepage photograph is the only local image this opt-in
// changes. Managed D1 /media URLs continue using the established R2
// responsive variants; remote URLs remain untouched.
//
// The Worker already serves /_vinext/image via a Cloudflare Images binding.
// Widths are within vinext's standard allowed image/device size sets.
const HOMEPAGE_PHOTO = "/images/hero-labrador.webp";
const HERO_WIDTHS = [384, 640, 828, 1200, 1920] as const;
const HERO_QUALITY = 72;

export const HERO_IMAGE_SIZES =
  "(max-width: 620px) 100vw, (max-width: 1228px) calc(100vw - 48px), 1180px";

function optimizedHeroCandidate(width: number): string {
  return `/_vinext/image?url=${encodeURIComponent(HOMEPAGE_PHOTO)}&w=${width}&q=${HERO_QUALITY}`;
}

export function publicHeroImageSrc(src: string): string {
  return src === HOMEPAGE_PHOTO ? optimizedHeroCandidate(1200) : src;
}

export function publicHeroImageSrcSet(src: string): string | undefined {
  return src === HOMEPAGE_PHOTO
    ? HERO_WIDTHS.map(width => `${optimizedHeroCandidate(width)} ${width}w`).join(", ")
    : responsiveMediaSrcSet(src, [640, 960, 1280, 1600, 1920]);
}
