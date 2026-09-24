import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerContactProfileForm } from "@/components/partner-contact-profile-form";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const identity = await requirePartnerPageIdentity({ allowIncompleteOnboarding: true });
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);

  if (identity.onboardingComplete) redirect(returnTo || "/partner");

  return (
    <main id="obsah" className="partner-shell">
      <section className="partner-auth-layout">
        <div className="partner-auth-copy">
          <span className="eyebrow">Partner Psipedia</span>
          <h1>Dokončite Partner účet</h1>
          <p className="lead">Potrebujeme iba kontaktnú osobu, aby bolo jasné, kto Partner účet spravuje. Firemné údaje zostávajú na canonical profiloch a neduplikujeme ich sem.</p>
        </div>
        <div className="partner-auth-card">
          <h2>Kontaktná osoba</h2>
          <p>Meno a priezvisko je povinné. Telefón a vaša úloha sú voliteľné.</p>
          <PartnerContactProfileForm mode="onboarding" returnTo={returnTo} />
          <p className="partner-auth-switch">
            Potrebujete sa odhlásiť alebo spravovať bezpečnosť účtu? <Link href="/partner/nastavenia">Otvoriť nastavenia</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
