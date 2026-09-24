import { PartnerGoogleLinkConfirm } from "@/components/partner-google-link-confirm";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";

export const dynamic = "force-dynamic";

export default async function PartnerGoogleLinkPage(){
  await requirePartnerPageIdentity({ allowIncompleteOnboarding: true, returnTo: "/partner/prepojit-google" });
  return <main id="obsah" className="partner-shell partner-shell--centered">
    <section className="partner-verification-card">
      <span className="eyebrow">Partner Psipedia</span>
      <h1>Prepojiť Google účet</h1>
      <p>Potvrďte prepojenie s Partner účtom, do ktorého ste práve prihlásení.</p>
      <PartnerGoogleLinkConfirm/>
    </section>
  </main>;
}
