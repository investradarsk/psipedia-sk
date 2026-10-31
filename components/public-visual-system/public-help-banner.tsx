import { AlertCircleIcon } from "@/components/help-public-icons";
import { ArrowIcon } from "@/components/icons";
import { PublicActionLink } from "./public-visual-system";
import { PublicPhotoCallout, type PublicPhotoCalloutData } from "./public-photo-callout";
import styles from "./public-help-banner.module.css";
import { PublicBannerFrame } from "./public-banner-frame";

export type PublicHelpPhotoBannerData = Omit<PublicPhotoCalloutData, "tone"> & {
  tone: "care" | "rescue" | "volunteer";
};

export const lostFoundSubmitPromo: PublicHelpPhotoBannerData = {
  eyebrow: "Stratený alebo nájdený pes",
  title: "Stratil sa vám pes alebo ste psa našli?",
  text: "Pošlite hlásenie cez krátky formulár. Kontaktné údaje zostanú súkromné a záznam sa zobrazí až po kontrole.",
  href: "/pomoc-psom/stratene-a-najdene/nahlasit",
  action: "Nahlásiť psa",
  tone: "rescue",
};

export function PublicHelpPhotoBanner({ promo }: { promo: PublicHelpPhotoBannerData }) {
  return <PublicPhotoCallout promo={promo} />;
}

export function PublicHelpReportBanner() {
  return (
    <PublicBannerFrame className={styles.reportBanner} aria-label="Rýchla pomoc pri nájdenom psovi">
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
    </PublicBannerFrame>
  );
}

export function PublicHelpClosingBanner() {
  return <PublicPhotoCallout
    headingId="help-closing-cta-heading"
    promo={{
      eyebrow: "Každá pomoc má zmysel",
      title: "Pomáhajme spolu",
      text: "Lepší svet pre psov vzniká vďaka ľuďom, ktorí nechcú zostať bokom.",
      href: "/pomoc-psom/dobrovolnictvo",
      action: "Chcem pomôcť",
      tone: "closing",
    }}
  />;
}
