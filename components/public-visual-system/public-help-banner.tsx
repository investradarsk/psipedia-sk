import { AlertCircleIcon } from "@/components/help-public-icons";
import { ArrowIcon } from "@/components/icons";
import { PublicActionLink } from "./public-visual-system";
import { PublicPhotoCallout, type PublicPhotoCalloutData } from "./public-photo-callout";
import { helpClosingPromo, lostFoundSubmitPromo } from "@/lib/help-banner-presets";
import { HELP_CLOSING_BANNER_ANCHOR } from "@/lib/visual-library-anchors";
export { lostFoundSubmitPromo } from "@/lib/help-banner-presets";
import styles from "./public-help-banner.module.css";

export type PublicHelpPhotoBannerData = Omit<PublicPhotoCalloutData, "tone"> & {
  tone: "care" | "rescue" | "volunteer";
};

export function PublicHelpPhotoBanner({ promo, anchorId }: { promo: PublicHelpPhotoBannerData; anchorId?: string }) {
  return <PublicPhotoCallout promo={promo} anchorId={anchorId} />;
}

export function PublicHelpReportBanner() {
  return (
    <aside className={`ps-public-banner-frame ${styles.reportBanner}`} aria-label="Rýchla pomoc pri nájdenom psovi">
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
  return <PublicPhotoCallout
    headingId="help-closing-cta-heading"
    anchorId={HELP_CLOSING_BANNER_ANCHOR}
    promo={helpClosingPromo}
  />;
}
