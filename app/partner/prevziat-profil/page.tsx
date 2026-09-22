import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PartnerClaimForm } from "@/components/partner-claim-form";
import { PartnerShell } from "@/components/partner-shell";
import { getPartnerSession } from "@/lib/partner-auth";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";
import { getClaimablePartnerResourcePreview } from "@/lib/partner-claims";
import { partnerAuthHref } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

type Search = { type?: string | string[]; id?: string | string[] };

export default async function PartnerClaimPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const entityType = typeof raw.type === "string" ? raw.type : "";
  const canonicalId = typeof raw.id === "string" ? raw.id : "";
  const resource = await getClaimablePartnerResourcePreview(entityType, canonicalId);
  if (!resource) notFound();

  const returnTo = `/partner/prevziat-profil?type=${encodeURIComponent(resource.entityType)}&id=${resource.canonicalId}`;
  const jar = await cookies();
  const identity = await getPartnerSession({ token: jar.get(PARTNER_SESSION_COOKIE)?.value });
  if (!identity) redirect(partnerAuthHref("/partner/prihlasenie", returnTo));

  return (
    <PartnerShell
      title="Prevziať existujúci profil"
      description="Pošlite žiadosť o právo spravovať existujúci profil. Schválenie nie je automatické a pred rozhodnutím nezískate žiadne oprávnenia."
    >
      <PartnerClaimForm
        entityType={resource.entityType}
        canonicalId={resource.canonicalId}
        name={resource.name}
        publicHref={resource.publicHref}
      />
      <p className="partner-foundation-note">Správa základných údajov profilu je bezplatná. Prevzatie profilu, overenie správcu a budúce komerčné možnosti sú oddelené procesy.</p>
    </PartnerShell>
  );
}
