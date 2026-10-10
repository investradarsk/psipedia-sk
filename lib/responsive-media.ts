/**
 * The public R2 /media endpoint serves original files by default and
 * width-constrained WebP variants only when requested. Originals, OG images,
 * downloads and stored Notion image URLs are never rewritten.
 */
export const RESPONSIVE_MEDIA_WIDTHS = [160, 320, 480, 640, 768, 960, 1280, 1600, 1920] as const;

export function responsiveMediaSrcSet(
  src: string | null | undefined,
  widths: readonly number[] = RESPONSIVE_MEDIA_WIDTHS,
): string | undefined {
  const url = src?.trim();
  if (!url || !/^\/media\/(?!safe\/|quarantine\/)(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:jpe?g|png|webp|avif)$/i.test(url)) {
    return undefined;
  }

  const uniqueWidths = [...new Set(widths)]
    .filter((width) => RESPONSIVE_MEDIA_WIDTHS.includes(width as typeof RESPONSIVE_MEDIA_WIDTHS[number]))
    .sort((a, b) => a - b);

  return uniqueWidths.length
    ? uniqueWidths.map((width) => `${url}?w=${width} ${width}w`).join(", ")
    : undefined;
}
