import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerResources } from "@/lib/partner-platform";
import { getPartnerCommercialDashboardSummary } from "@/lib/partner-commercial-agreements";

export const dynamic = "force-dynamic";

export default async function PartnerHomePage() {
  const identity = await requirePartnerPageIdentity();
  const [resources, commercial] = await Promise.all([
    listPartnerResources(identity.accountId),
    getPartnerCommercialDashboardSummary(identity.accountId),
  ]);

  return (
    <PartnerShell title="Prehľad" description="Prehľad profilov a podujatí, ktoré môžete spravovať cez Partner účet.">
      <section className="partner-hero partner-hero--compact">
        <h2>{resources.length ? `Spravované profily a podujatia: ${resources.length}` : "Zatiaľ nemáte priradený profil ani podujatie"}</h2>
        <p>{resources.length ? "Tu nájdete všetky profily a podujatia, ktoré môžete aktuálne spravovať." : "Keď vám bude priradený profil alebo podujatie, zobrazí sa na tomto mieste."}</p>
        <div className="partner-hero-actions">
          <Link className="button button--dark" href="/partner/nastavenia">Nastavenia účtu</Link>
          <Link className="button" href="/partner/propagacia">Propagácia</Link>
        </div>
      </section>
      <section className="partner-foundation-note" aria-label="Komerčný stav">
        <strong>Komerčné možnosti</strong>
        <p>Aktívne Premium: {commercial.activePremium} · Aktívne propagácie: {commercial.activePromotions} · Otvorené komerčné žiadosti: {commercial.openRequests}</p>
      </section>
      <section className="partner-foundation-note" aria-label="Dostupné funkcie">
        <strong>Aktuálne dostupné</strong>
        <p>Správa profilov a podujatí, moderované zmeny, komerčné ponuky a bezpečná správa Partner účtu.</p>
      </section>
    </PartnerShell>
  );
}
