import { PublicActionLink } from "./public-visual-system/public-visual-system";
import type { ContentHubCtaDecision } from "@/lib/content-hub-context-cta";
import styles from "./content-hub-cta.module.css";
import { PublicBannerFrame } from "./public-visual-system/public-banner-frame";
import { PublicBannerContent } from "./public-visual-system/public-magazine-banner";

// Navigational CTA only: article promo semantics and health disclaimers are unchanged.
export function ContentHubCta({ cta }: { cta: ContentHubCtaDecision }) {
  const urgent = cta.key === "health-urgent";
  const actions = cta.actions.map((action) => (
    <PublicActionLink href={action.href} appearance="context"
      variant={action.role === "primary" ? "primary" : "secondary"}
      className={action.role === "primary" ? styles.primary : styles.secondary}
      data-promo-key={action.promoKey} key={action.href}>
      {action.label}
    </PublicActionLink>
  ));
  const description = <>
    {cta.lead && <p className={styles.lead}>{cta.lead}</p>}
    <p className={styles.text}>{cta.text}</p>
  </>;

  return (
    <PublicBannerFrame
      visual={cta.key === "health-urgent" ? "dark" : "light"}
      size="small"
      className={styles.card}
      aria-label={cta.headline}
      data-contextual-hub-cta
      data-cta-key={cta.key}
      data-health-urgent={cta.key === "health-urgent" ? "" : undefined}
      data-banner-semantic={cta.key === "health-urgent" ? "urgent" : undefined}
    >
      {urgent ? (
        <>
          <div className={styles.copy}>
            <h3 className={styles.headline}>{cta.headline}</h3>
            {description}
          </div>
          <div className={styles.actions} data-public-banner-actions>{actions}</div>
        </>
      ) : (
        <PublicBannerContent
          headingAs="h3"
          headingClassName={styles.headline}
          copyClassName={styles.copy}
          actionsClassName={styles.actions}
          title={cta.headline}
          description={description}
          actions={actions}
        />
      )}
    </PublicBannerFrame>
  );
}
