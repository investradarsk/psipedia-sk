import { ArrowIcon } from "@/components/icons";
import { PageContainer } from "@/components/page-system";
import { PublicActionLink } from "./public-visual-system";
import styles from "./public-photo-callout.module.css";

/**
 * Shared public photographic CTA. A data-driven tone changes only its photo,
 * never its dimensions, typography, overlay, or action placement.
 */
export type PublicPhotoCalloutData = {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  action: string;
  tone: "care" | "rescue" | "volunteer" | "closing";
};

export function PublicPhotoCallout({
  promo,
  headingId,
}: {
  promo: PublicPhotoCalloutData;
  headingId?: string;
}) {
  return (
    <section
      className={["ps-public-banner-frame", styles.banner, styles[promo.tone]].join(" ")}
      aria-labelledby={headingId}
      data-public-photo-callout={promo.tone}
    >
      <div className={styles.overlay}>
        <PageContainer className={styles.copy}>
          <span className={styles.eyebrow}>{promo.eyebrow}</span>
          <h2 id={headingId}>{promo.title}</h2>
          <p>{promo.text}</p>
          <PublicActionLink href={promo.href} variant="primary" icon={<ArrowIcon size={16} />}>
            {promo.action}
          </PublicActionLink>
        </PageContainer>
      </div>
    </section>
  );
}
