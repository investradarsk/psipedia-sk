import Link from "next/link";
import { PartnerAuthForm } from "@/components/partner-auth-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  const siteKey = getPartnerTurnstileSiteKey();

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner Psipedia</span>
          <h1>Prihlásenie do Partner účtu</h1>
          <p className="lead">Na prihlásenie používame bezpečný jednorazový odkaz poslaný na váš e-mail. Žiadne heslo si nemusíte pamätať.</p>
          <p className="partner-auth-help">Partner účet ešte nemáte? <Link href={returnTo ? `/partner/registracia?returnTo=${encodeURIComponent(returnTo)}` : "/partner/registracia"}>Začnite registráciu.</Link></p>
        </div>
        <div className="partner-auth-card">
          <h2>Poslať prihlasovací odkaz</h2>
          <p>Zadajte e-mail, ktorý používate pre Partner účet.</p>
          <PartnerAuthForm mode="login" siteKey={siteKey} returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
