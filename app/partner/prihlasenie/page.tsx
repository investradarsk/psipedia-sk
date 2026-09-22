import Link from "next/link";
import { PartnerAuthForm } from "@/components/partner-auth-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";

export const dynamic = "force-dynamic";

export default function PartnerLoginPage() {
  const siteKey = getPartnerTurnstileSiteKey();

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner Psipedia</span>
          <h1>Prihlásenie do Partner účtu</h1>
          <p className="lead">Na prihlásenie používame bezpečný jednorazový odkaz poslaný na váš e-mail. Žiadne heslo si nemusíte pamätať.</p>
          <p className="partner-auth-help">Partner účet ešte nemáte? <Link href="/partner/registracia">Začnite registráciu.</Link></p>
        </div>
        <div className="partner-auth-card">
          <h2>Poslať prihlasovací odkaz</h2>
          <p>Zadajte e-mail, ktorý používate pre Partner účet.</p>
          <PartnerAuthForm mode="login" siteKey={siteKey} />
        </div>
      </section>
    </main>
  );
}
