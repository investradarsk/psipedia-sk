import { PartnerSettingsActions } from "@/components/partner-settings-actions";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";

export const dynamic = "force-dynamic";

export default async function PartnerSettingsPage() {
  const identity = await requirePartnerPageIdentity();

  return (
    <PartnerShell title="Nastavenia" description="Bezpečnostné nastavenia Partner účtu.">

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

      <PartnerSettingsActions siteKey={getPartnerTurnstileSiteKey()} />
    </PartnerShell>
  );
}
