import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import type { VisualBanner } from "@/lib/visual-library-banners";

/**
 * The only mapping between a visual-library banner preset and its real public
 * React renderer. All owner-facing galleries, comparisons and draft previews
 * must use this same adapter: the public layout itself is never duplicated.
 *
 * Read-only: no D1, fetch, publish action or production markup change.
 */
export type AdminBannerPreviewCopy = {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
};

export function AdminVisualLibraryBannerPreview({
  banner,
  testId,
  copy,
}: {
  banner: VisualBanner;
  testId: string;
  copy?: AdminBannerPreviewCopy;
}) {
  return (
    <PublicMagazineBanner
      compact={banner.group === "clanky"}
      photoTone={banner.photoTone}
      testId={testId}
      eyebrow={copy?.eyebrow ?? banner.eyebrow}
      title={copy?.title ?? banner.title}
      description={copy?.description ?? banner.description}
      label={copy?.label ?? banner.ctaLabel}
      href={banner.ctaHref}
    />
  );
}
