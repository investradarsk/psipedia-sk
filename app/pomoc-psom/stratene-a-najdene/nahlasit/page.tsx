import Link from "next/link";
import { LostFoundSubmissionForm } from "@/components/lost-found-submission-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { lostFoundSubmissionEnabled } from "@/lib/submission-feature-flags";

export const dynamic = "force-dynamic";

function UnavailableState({ security = false }: { security?: boolean }) {
  return (
    <main id="obsah" className="page-body shell">
      <section className="article-card article-card--large">
        <div className="article-card-body">
          <span className="eyebrow">Pomoc psom</span>
          <h1>Nahlásenie momentálne nie je dostupné</h1>
          <p>
            {security
              ? "Bezpečnostné overenie formulára momentálne nie je nakonfigurované."
              : "Verejné nahlasovanie stratených a nájdených psov zatiaľ nie je zapnuté."}
          </p>
          <Link className="button button--dark" href="/pomoc-psom/stratene-a-najdene">Späť na hlásenia</Link>
        </div>
      </section>
    </main>
  );
}

export default function LostFoundSubmissionPage() {
  if (!lostFoundSubmissionEnabled()) return <UnavailableState />;
  const siteKey = getPartnerTurnstileSiteKey();
  if (!siteKey) return <UnavailableState security />;
  return <main id="obsah"><LostFoundSubmissionForm siteKey={siteKey} /></main>;
}
