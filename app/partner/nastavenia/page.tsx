import { PartnerContactProfileForm } from "@/components/partner-contact-profile-form";
import { PartnerSettingsActions } from "@/components/partner-settings-actions";
import { PartnerSecuritySettings } from "@/components/partner-security-settings";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerContactProfile } from "@/lib/partner-contact-profile";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { getPartnerAuthMethodSummary } from "@/lib/partner-auth-methods";
import { isPartnerGoogleOAuthEnabled } from "@/lib/partner-google-auth";

export const dynamic = "force-dynamic";

export default async function PartnerSettingsPage() {
  const identity = await requirePartnerPageIdentity({ allowIncompleteOnboarding: true });
  const [contactProfile, authMethods] = await Promise.all([
    getPartnerContactProfile(identity.accountId),
    getPartnerAuthMethodSummary(identity.accountId),
  ]);

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

      <PartnerSecuritySettings
        passwordSet={authMethods.passwordSet}
        googleLinked={authMethods.googleLinked}
        googleEnabled={isPartnerGoogleOAuthEnabled()}
      />

      <PartnerSettingsActions siteKey={getPartnerTurnstileSiteKey()} />
    </PartnerShell>
  );
}
