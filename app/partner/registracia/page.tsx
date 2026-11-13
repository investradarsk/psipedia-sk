import Link from "next/link";
import { PartnerAuthMethodSwitcher } from "@/components/partner-auth-method-switcher";
import { isPartnerGoogleOAuthEnabled } from "@/lib/partner-google-auth";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerRegistrationPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  const siteKey = getPartnerTurnstileSiteKey();
  const googleEnabled = isPartnerGoogleOAuthEnabled();
  const googleHref = "/api/partner/auth/google/start?intent=REGISTER" +
    (returnTo ? "&returnTo=" + encodeURIComponent(returnTo) : "");

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner účet Psipedia.sk</span>
          <h1>Registrácia Partner účtu</h1>
          <p className="lead">Vytvorte si Partner účet na správu profilov, služieb a podujatí na Psipedii. Určený je poskytovateľom služieb, organizáciám a oprávneným partnerom.</p>
          <div className="partner-benefit">
            <strong>Čo nasleduje</strong>
            <p>Po prihlásení budete môcť v ďalších krokoch prepojiť svoju organizáciu alebo službu.</p>
          </div>
          <p className="partner-auth-help">Mám Partner účet: <Link href={returnTo ? `/partner/prihlasenie?returnTo=${encodeURIComponent(returnTo)}` : "/partner/prihlasenie"}>Prejsť na prihlásenie</Link></p>
        </div>
        <div className="partner-auth-card">
          <h2>Nemám Partner účet</h2>
          {googleEnabled ? <a className="button button--google partner-google-button" href={googleHref}>Pokračovať cez Google</a> : null}
          {googleEnabled ? <div className="partner-auth-divider"><span>alebo</span></div> : null}

          <PartnerAuthMethodSwitcher mode="register" siteKey={siteKey} returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
