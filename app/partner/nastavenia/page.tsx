import { PartnerContactProfileForm } from "@/components/partner-contact-profile-form";
import { PartnerSettingsActions } from "@/components/partner-settings-actions";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerContactProfile } from "@/lib/partner-contact-profile";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";

export const dynamic = "force-dynamic";

export default async function PartnerSettingsPage() {
  const identity = await requirePartnerPageIdentity({ allowIncompleteOnboarding: true });
  const contactProfile = await getPartnerContactProfile(identity.accountId);

  return (
    <PartnerShell title="Nastavenia" description="Kontaktné a bezpečnostné nastavenia Partner účtu.">

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

      <section className="partner-settings-card">
        <h2>Kontaktná osoba</h2>
        <p>Tieto údaje slúžia iba na identifikáciu osoby, ktorá Partner účet spravuje. Údaje firmy alebo prevádzky patria na verejný profil.</p>
        <PartnerContactProfileForm
          mode="settings"
          initial={{
            contactName: contactProfile?.contactName ?? "",
            phone: contactProfile?.phone ?? "",
            relationship: contactProfile?.relationship ?? "",
          }}
        />
      </section>

      <PartnerSettingsActions siteKey={getPartnerTurnstileSiteKey()} />
    </PartnerShell>
  );
}
