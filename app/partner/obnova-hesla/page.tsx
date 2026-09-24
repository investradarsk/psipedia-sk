import { PartnerPasswordResetForm } from "@/components/partner-password-reset-form";

export const dynamic = "force-dynamic";

export default function PartnerPasswordResetPage(){
  return <main id="obsah" className="partner-shell partner-shell--centered">
    <section className="partner-verification-card">
      <span className="eyebrow">Partner Psipedia</span>
      <h1>Obnovenie hesla</h1>
      <p>Nastavte nové heslo. Po zmene z bezpečnostných dôvodov zneplatníme všetky existujúce Partner sessions.</p>
      <PartnerPasswordResetForm/>
    </section>
  </main>;
}
