import Link from "next/link";
import { PartnerForgotPasswordForm } from "@/components/partner-forgot-password-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";

export const dynamic = "force-dynamic";

export default function PartnerForgotPasswordPage(){
  return <main id="obsah" className="partner-shell partner-shell--centered">
    <section className="partner-verification-card">
      <span className="eyebrow">Partner Psipedia</span>
      <h1>Zabudli ste heslo?</h1>
      <p>Zadajte e-mail Partner účtu. Ak je možné heslo obnoviť, pošleme vám jednorazový odkaz.</p>
      <PartnerForgotPasswordForm siteKey={getPartnerTurnstileSiteKey()}/>
      <p className="partner-auth-help"><Link href="/partner/prihlasenie">Späť na prihlásenie</Link></p>
    </section>
  </main>;
}
