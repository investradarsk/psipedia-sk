import Link from "next/link";
import type { ContentHubCtaDecision } from "@/lib/content-hub-context-cta";
import styles from "./content-hub-cta.module.css";

// Navigational CTA only: article promo semantics and health disclaimers are unchanged.
export function ContentHubCta({ cta }: { cta: ContentHubCtaDecision }) {
  return (
    <aside
      className={styles.card}
      aria-label={cta.headline}
      data-contextual-hub-cta
      data-cta-key={cta.key}
      data-health-urgent={cta.key === "health-urgent" ? "" : undefined}
    >
      <div className={styles.copy}>
        <h3 className={styles.headline}>{cta.headline}</h3>
        {cta.lead && <p className={styles.lead}>{cta.lead}</p>}
        <p className={styles.text}>{cta.text}</p>
      </div>
      <div className={styles.actions}>
        {cta.actions.map((action) => (
          <Link href={action.href}
            className={action.role === "primary" ? styles.primary : styles.secondary}
            data-promo-key={action.promoKey} key={action.href}>
            {action.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
