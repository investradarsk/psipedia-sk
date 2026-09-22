import Link from "next/link";
import {PartnerShell} from "@/components/partner-shell";
import {requirePartnerPageIdentity} from "@/lib/partner-page-auth";
import {listPartnerResources} from "@/lib/partner-platform";

export const dynamic = "force-dynamic";

export default async function PartnerHomePage() {
  const identity=await requirePartnerPageIdentity();const resources=await listPartnerResources(identity.accountId);

  return (
    <PartnerShell title="Prehľad" description="Bezpečný prehľad profilov a podujatí, ktoré vám Psipedia priradila.">
      <section className="partner-hero partner-hero--compact">
        <h2>{resources.length?`Spravujete ${resources.length} ${resources.length===1?"zdroj":"zdroje"}`:"Zatiaľ nemáte priradený profil"}</h2>
        <p>{resources.length?"Všetky oprávnenia sa overujú priamo podľa aktuálneho členstva.":"Keď vám administrátor priradí profil alebo podujatie, zobrazí sa na tomto mieste."}</p>
        <div className="partner-hero-actions">
          <Link className="button button--dark" href="/partner/nastavenia">Nastavenia účtu</Link>
        </div>
      </section>
      <section className="partner-foundation-note" aria-label="Stav Partner platformy">
        <strong>Aktuálne dostupné</strong>
        <p>Prihlásenie bez hesla, overenie e-mailu, bezpečná session, odhlásenie a deaktivácia účtu.</p>
      </section>
    </PartnerShell>
  );
}
