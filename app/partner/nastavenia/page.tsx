import { settleOptionalRead } from "@/lib/optional-read-recovery";
import { retryTransientRead } from "@/lib/public-read-retry";
import { PartnerLifecycleRequest } from "@/components/partner-lifecycle-request";
import { PartnerNotificationSettings } from "@/components/partner-notification-settings";
import { getPartnerNotificationPreferences } from "@/lib/partner-chat";
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
  const [contactProfile, authMethods, preferences] = await Promise.all([
    settleOptionalRead("partner_contact_profile", retryTransientRead(() => getPartnerContactProfile(identity.accountId)), undefined),
    settleOptionalRead("partner_auth_method_summary", getPartnerAuthMethodSummary(identity.accountId), undefined),
    settleOptionalRead("partner_notification_preferences", retryTransientRead(() => getPartnerNotificationPreferences({accountId:identity.accountId})), undefined),
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
        {contactProfile === undefined ? <p role="status">Kontaktné údaje sú dočasne nedostupné.</p> : <PartnerContactProfileForm
          mode="settings"
          initial={{
            contactName: contactProfile?.contactName ?? "",
            phone: contactProfile?.phone ?? "",
            relationship: contactProfile?.relationship ?? "",
          }}
        />}
      </section>

      {authMethods === undefined ? <p role="status">Bezpečnostné nastavenia sú dočasne nedostupné.</p> : <PartnerSecuritySettings
        passwordSet={authMethods.passwordSet}
        googleLinked={authMethods.googleLinked}
        googleEnabled={isPartnerGoogleOAuthEnabled()}
      />}

      {preferences === undefined ? <p role="status">Nastavenia upozornení sú dočasne nedostupné.</p> : <PartnerNotificationSettings initial={preferences}/>}
      <PartnerLifecycleRequest account />
      <PartnerSettingsActions siteKey={getPartnerTurnstileSiteKey()} />
    </PartnerShell>
  );
}
