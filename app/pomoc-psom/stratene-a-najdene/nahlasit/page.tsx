import Link from "next/link";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { LostFoundSubmissionForm } from "@/components/lost-found-submission-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { lostFoundSubmissionEnabled } from "@/lib/submission-feature-flags";
import headerStyles from "@/components/site-header.module.css";

export const dynamic = "force-dynamic";

function UnavailableState({ security = false }: { security?: boolean }) {
  return (
    <main id="obsah">
      <UniversalPageHero eyebrow="Pomoc psom" title="Nahlásiť strateného alebo nájdeného psa" intro="Pošli hlásenie o stratenom alebo nájdenom psovi. Záznam sa zobrazí po kontrole." />
      <div className="page-body shell">
      <section className="article-card article-card--large">
        <div className="article-card-body">
          <span className="eyebrow">Pomoc psom</span>
          <h2>Nahlásenie momentálne nie je dostupné</h2>
          <p>
            {security
              ? "Bezpečnostné overenie formulára momentálne nie je nakonfigurované."
              : "Verejné nahlasovanie stratených a nájdených psov zatiaľ nie je zapnuté."}
          </p>
          <Link className="button button--dark" href="/pomoc-psom/stratene-a-najdene">Späť na hlásenia</Link>
        </div>
      </section>
      </div>
    </main>
  );
}

export default function LostFoundSubmissionPage() {
  if (!lostFoundSubmissionEnabled()) return <UnavailableState />;
  const siteKey = getPartnerTurnstileSiteKey();
  if (!siteKey) return <UnavailableState security />;
  return (
    <main id="obsah" className={headerStyles.routeCssAnchor}>
      <UniversalPageHero eyebrow="Pomoc psom" title="Nahlásiť strateného alebo nájdeného psa" intro="Vyplň hlásenie o psovi. Kontaktné údaje zostanú súkromné a záznam sa zobrazí po kontrole." />
      <LostFoundSubmissionForm siteKey={siteKey} />
    </main>
  );
}
