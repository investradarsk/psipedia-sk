import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOrganizationEditor } from "@/components/admin-organization-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminOrganizationFundraising } from "@/components/admin-organization-fundraising";
import { AdminOrganizationLocations } from "@/components/admin-organization-locations";
import { AdminProfileGoogleMaps } from "@/components/admin-profile-google-maps";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import { listOrganizationFundraisingMethodsAdmin } from "@/lib/organization-fundraising-admin-store";
import { listOrganizationLocationsAdmin } from "@/lib/organization-location-admin-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function OrganizationAdminDetailPage({ params }: Props) {
  const { id } = await params;
  const organizationId = Number(id);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) notFound();
  const user = await requireAdminPageUser("/admin/organizacie/" + id);
  const [organization, locations, methods] = await Promise.all([
    getOrganizationPublicationAdminById(organizationId),
    listOrganizationLocationsAdmin(organizationId),
    listOrganizationFundraisingMethodsAdmin(organizationId),
  ]);
  if (!organization) notFound();
  const [duplicateWarning, automationSuggestions, review] = await Promise.all([
    getCanonicalDraftDuplicateWarning("ORGANIZATION", organization.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "ORGANIZATION", canonicalEntityId: organization.id }),
    getAdminEntityReview("ORGANIZATION", organization.id),
  ]);

  return <AdminShell
    user={user}
    eyebrow="Organizácie · Detail"
    title={organization.name}
    description="Canonical údaje, jedna adresa, Google Maps a fundraising na jednom admin detaile."
   actions={<>
    <AdminReviewCheckbox entityType="ORGANIZATION" entityId={organization.id} initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />
    {organization.status === "PUBLISHED" && organization.slug && <Link href={"/organizacie/" + organization.slug} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}
    <Link href="/admin/organizacie">← Späť na organizácie</Link>
   </>}>
    <AdminCanonicalDraftWarning warning={duplicateWarning} />
    <AdminOrganizationEditor organization={organization} automationSuggestions={automationSuggestions} />
    <div id="address"><AdminOrganizationLocations organization={organization} initialLocations={locations} /></div>
    <div id="google-maps">
      <AdminProfileGoogleMaps
        targetType="ORGANIZATION_LOCATION"
        targetId={organization.id}
        endpoint={`/api/admin/organizations/${organization.id}/google-place`}
      />
    </div>
    <div id="fundraising"><AdminOrganizationFundraising organization={organization} initialMethods={methods} /></div>
    {organization.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="ORGANIZATION" canonicalEntityId={organization.id} returnHref="/admin/organizacie" />}
  </AdminShell>;
}
