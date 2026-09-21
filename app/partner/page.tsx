import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner-auth";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";

export const dynamic = "force-dynamic";

export default async function PartnerHomePage() {
  const cookieStore = await cookies();
  const identity = await getPartnerSession({
    token: cookieStore.get(PARTNER_SESSION_COOKIE)?.value,
  });
  if (!identity) redirect("/partner/prihlasenie");

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-hero partner-hero--compact">
        <span className="eyebrow">Partner Psipedia</span>
        <h1>Partner účet je pripravený</h1>
        <p>Ste bezpečne prihlásený. Správa organizácií, služieb a ďalšie Partner funkcie budú pridané v nasledujúcich krokoch platformy.</p>
        <div className="partner-hero-actions">
          <Link className="button button--dark" href="/partner/nastavenia">Nastavenia účtu</Link>
        </div>
      </section>
      <section className="partner-foundation-note" aria-label="Stav Partner platformy">
        <strong>Aktuálne dostupné</strong>
        <p>Prihlásenie bez hesla, overenie e-mailu, bezpečná session, odhlásenie a deaktivácia účtu.</p>
      </section>
    </main>
  );
}
