import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PartnerSettingsActions } from "@/components/partner-settings-actions";
import { getPartnerSession } from "@/lib/partner-auth";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";

export const dynamic = "force-dynamic";

export default async function PartnerSettingsPage() {
  const cookieStore = await cookies();
  const identity = await getPartnerSession({
    token: cookieStore.get(PARTNER_SESSION_COOKIE)?.value,
  });
  if (!identity) redirect("/partner/prihlasenie");

  return (
    <main id="obsah" className="partner-shell">
      <header className="partner-settings-heading">
        <span className="eyebrow">Partner účet</span>
        <h1>Nastavenia</h1>
        <p>V tejto fáze sú dostupné iba nastavenia, ktoré sú už funkčné.</p>
      </header>

      <section className="partner-account-summary">
        <div>
          <span>Prihlásený e-mail</span>
          <strong>{identity.email}</strong>
        </div>
        <div>
          <span>Stav účtu</span>
          <strong>Aktívny</strong>
        </div>
      </section>

      <PartnerSettingsActions siteKey={getPartnerTurnstileSiteKey()} />
    </main>
  );
}
