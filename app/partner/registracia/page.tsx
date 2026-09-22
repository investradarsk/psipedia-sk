import Link from "next/link";
import { PartnerAuthForm } from "@/components/partner-auth-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerRegistrationPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  const siteKey = getPartnerTurnstileSiteKey();

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner Psipedia</span>
          <h1>Spravujte svoju prezentáciu na Psipedii.</h1>
          <p className="lead">Partner účet je určený pre firmy, služby, organizácie a ďalších profesionálnych partnerov Psipedie.</p>
          <div className="partner-benefit">
            <strong>Čo nasleduje</strong>
            <p>Po prihlásení budete môcť v ďalších krokoch prepojiť svoju organizáciu alebo službu.</p>
          </div>
          <p className="partner-auth-help">Už máte účet? <Link href={returnTo ? `/partner/prihlasenie?returnTo=${encodeURIComponent(returnTo)}` : "/partner/prihlasenie"}>Prihláste sa rovnakým spôsobom cez e-mailový odkaz.</Link></p>
        </div>
        <div className="partner-auth-card">
          <h2>Vytvoriť Partner účet</h2>
          <p>Zadajte pracovný e-mail. Heslo nepotrebujete — pošleme vám jednorazový prihlasovací odkaz.</p>
          <PartnerAuthForm mode="register" siteKey={siteKey} returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
