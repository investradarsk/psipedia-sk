import { PublicActionLink } from "@/components/public-visual-system";
import { ArrowIcon } from "@/components/icons";
import {
  resolveArticlePromo,
  type ArticlePromoKey,
  type ArticlePromoVariant,
} from "@/lib/article-promo";
import styles from "@/components/article-promo.module.css";

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
  const ctaLabel = copy.ctaLabel ?? target.ctaLabel;

  return (
    <aside
      className={`ps-public-banner-frame ${styles.card} ${compact ? styles.compact : ""}`}
      aria-label={`Promo Psipedie: ${copy.headline}`}
      data-promo-key={promoKey}
      data-promo-variant={variantKey}
    >
      <span className={styles.accent} aria-hidden="true" />
      <div className={styles.copy}>
        <p className={styles.kicker}>{copy.kicker}</p>
        <h3 className={styles.headline}>{copy.headline}</h3>
        <p className={styles.body}>{copy.body}</p>
      </div>
      <PublicActionLink className={styles.cta} variant="secondary" href={target.href} aria-label={`${ctaLabel}: ${target.label}`} icon={<ArrowIcon size={16} />}>
        {ctaLabel}
      </PublicActionLink>
    </aside>
  );
}
