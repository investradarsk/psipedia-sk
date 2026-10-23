import { AlertCircleIcon } from "@/components/help-public-icons";
import { ArrowIcon } from "@/components/icons";
import { PageContainer } from "@/components/page-system";
import { PublicActionLink } from "./public-visual-system";
import styles from "./public-help-banner.module.css";

export type PublicHelpPhotoBannerData = {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  action: string;
  tone: "care" | "rescue" | "volunteer";
};

export function PublicHelpPhotoBanner({ promo }: { promo: PublicHelpPhotoBannerData }) {
  return (
    <aside className={[styles.overviewPromo, styles[`overviewPromo_${promo.tone}`]].join(" ")}>
      <div className={styles.overviewPromoShade}>
        <PageContainer className={styles.overviewPromoCopy}>
          <span>{promo.eyebrow}</span>
          <h2>{promo.title}</h2>
          <p>{promo.text}</p>
          <PublicActionLink href={promo.href} variant="primary" icon={<ArrowIcon size={16} />}>
            {promo.action}
          </PublicActionLink>
        </PageContainer>
      </div>
    </aside>
  );
}


export function PublicHelpReportBanner() {
  return (
          <aside className={styles.reportBanner} aria-label="Rýchla pomoc pri nájdenom psovi">
            <div className={styles.reportCopy}>
              <span className={styles.reportIcon}><AlertCircleIcon size={22} /></span>
              <div>
                <span className={styles.reportEyebrow}>Rýchla pomoc</span>
                <strong>Našli ste psa v núdzi?</strong>
                <p>Čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.</p>
              </div>
            </div>
            <PublicActionLink href="/pomoc-psom/nahlasit-psa-v-nudzi" variant="secondary" icon={<ArrowIcon size={16} />}>
              Postup krok za krokom
            </PublicActionLink>
          </aside>
  );
}

export function PublicHelpClosingBanner() {
  return (
        <section className={styles.closingCta} aria-labelledby="help-closing-cta-heading">
          <div className={styles.closingCtaOverlay}>
            <PageContainer className={styles.closingCtaInner}>
              <span className={styles.closingEyebrow}>Každá pomoc má zmysel</span>
              <h2 id="help-closing-cta-heading">Pomáhajme spolu</h2>
              <p>Lepší svet pre psov vzniká vďaka ľuďom, ktorí nechcú zostať bokom.</p>
              <PublicActionLink href="/pomoc-psom/dobrovolnictvo" variant="primary" icon={<ArrowIcon size={16} />}>
                Chcem pomôcť
              </PublicActionLink>
            </PageContainer>
          </div>
        </section>
  );
}
