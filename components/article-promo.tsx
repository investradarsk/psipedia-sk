import {
  resolveArticlePromo,
  type ArticlePromoKey,
  type ArticlePromoVariant,
} from "@/lib/article-promo";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";

/**
 * Editorial promos reuse the same managed PublicMagazineBanner structure as
 * homepage, Help and breed utilities. All attribution and deterministic
 * targeting remain unchanged.
 */
export function ArticlePromo({
  promoKey,
  variant,
  seed,
  utcDay,
  compact = false,
}: {
  promoKey: ArticlePromoKey;
  variant: ArticlePromoVariant;
  seed: string;
  utcDay?: string;
  compact?: boolean;
}) {
  const { target, copy, variantKey } = resolveArticlePromo(promoKey, variant, seed, utcDay);
  return (
    <PublicMagazineBanner
      compact={compact}
      testId={`article-${promoKey}`}
      eyebrow={copy.kicker}
      title={copy.headline}
      description={copy.body}
      label={copy.ctaLabel ?? target.ctaLabel}
      href={target.href}
      promoKey={promoKey}
      promoVariant={variantKey}
    />
  );
}
