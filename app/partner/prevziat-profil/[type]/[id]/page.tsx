import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PartnerClaimForm } from "@/components/partner-claim-form";
import { PartnerShell } from "@/components/partner-shell";
import { getPartnerSession } from "@/lib/partner-auth";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";
import { getClaimablePartnerResourcePreview } from "@/lib/partner-claims";
import { partnerAuthHref } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string; id: string }> };

export default async function PartnerClaimPage({ params }: Props) {
  const { type, id } = await params;
  const resource = await getClaimablePartnerResourcePreview(type, id);
  if (!resource) notFound();

  const returnTo = `/partner/prevziat-profil/${encodeURIComponent(resource.entityType)}/${resource.canonicalId}`;
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
