import Link from "next/link";
import { PartnerAuthForm } from "@/components/partner-auth-form";
import { PartnerPasswordAuthForm } from "@/components/partner-password-auth-form";
import { isPartnerGoogleOAuthEnabled } from "@/lib/partner-google-auth";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerLoginPage({ searchParams }: { searchParams: Promise<{
  returnTo?: string | string[];
  google?: string | string[];
  googleLink?: string | string[];
}> }) {
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  const siteKey = getPartnerTurnstileSiteKey();
  const googleEnabled = isPartnerGoogleOAuthEnabled();
  const googleState = typeof raw.google === "string" ? raw.google : null;
  const googleLink = typeof raw.googleLink === "string" ? raw.googleLink : null;
  const googleHref = "/api/partner/auth/google/start?intent=LOGIN" +
    (returnTo ? "&returnTo=" + encodeURIComponent(returnTo) : "");

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner Psipedia</span>
          <h1>Prihlásenie do Partner účtu</h1>
          <p className="lead">{googleEnabled ? "Prihláste sa cez Google, heslom alebo jednorazovým odkazom na e-mail." : "Prihláste sa heslom alebo jednorazovým odkazom na e-mail."}</p>
          <p className="partner-auth-help">Partner účet ešte nemáte? <Link href={returnTo ? `/partner/registracia?returnTo=${encodeURIComponent(returnTo)}` : "/partner/registracia"}>Začnite registráciu.</Link></p>
        </div>
        <div className="partner-auth-card">
          <h2>Prihlásiť sa</h2>
          {googleLink === "required" ? (
            <p className="partner-form-message is-success" role="status">
              Tento Google e-mail už patrí Partner účtu. Najprv sa prihláste do existujúceho účtu a potom Google bezpečne prepojíme.
            </p>
          ) : googleState === "unlinked" ? (
            <p className="partner-form-message is-error" role="status">
              Google účet zatiaľ nie je prepojený s Partner účtom. Prihláste sa heslom, odkazom na e-mail alebo sa zaregistrujte.
            </p>
          ) : googleState ? (
            <p className="partner-form-message is-error" role="status">Prihlásenie cez Google sa nepodarilo dokončiť.</p>
          ) : null}

          {googleEnabled ? <a className="button button--google partner-google-button" href={googleHref}>Pokračovať cez Google</a> : null}
          {googleEnabled ? <div className="partner-auth-divider"><span>alebo</span></div> : null}

          <PartnerPasswordAuthForm mode="login" siteKey={siteKey} returnTo={returnTo} />

          <div className="partner-auth-divider"><span>alebo</span></div>
          <div className="partner-auth-alternative">
            <h3>Prihlásiť sa odkazom na e-mail</h3>
            <p>Pošleme vám jednorazový odkaz platný 15 minút.</p>
            <PartnerAuthForm mode="login" siteKey={siteKey} returnTo={returnTo} />
          </div>
        </div>
      </section>
    </main>
  );
}
