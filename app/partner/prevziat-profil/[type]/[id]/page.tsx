import { notFound, redirect } from "next/navigation";
import { PartnerClaimForm } from "@/components/partner-claim-form";
import { PartnerShell } from "@/components/partner-shell";
import { getClaimablePartnerResourcePreview } from "@/lib/partner-claims";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerHelpMembership, helpResourceId, isPartnerHelpType } from "@/lib/partner-help-claims";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string; id: string }> };

export default async function PartnerClaimPage({ params }: Props) {
  const { type, id } = await params;
  const resource = await getClaimablePartnerResourcePreview(type, id);
  if (!resource) notFound();

  const returnTo = `/partner/prevziat-profil/${encodeURIComponent(resource.entityType)}/${resource.canonicalId}`;
  const identity = await requirePartnerPageIdentity({ returnTo });
  if (isPartnerHelpType(resource.entityType)) {
    const resourceId = helpResourceId(resource.entityType,resource.canonicalId);
    const owned = await getPartnerHelpMembership(identity.accountId,resourceId);
    if (owned) redirect(`/partner/pomoc/${encodeURIComponent(resourceId)}/upravit`);
  }

  return (
    <PartnerShell
      title="Požiadať o správu záznamu"
      description="Požiadajte o správu existujúceho profilu alebo podujatia. Prístup získate až po schválení administrátorom."
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
