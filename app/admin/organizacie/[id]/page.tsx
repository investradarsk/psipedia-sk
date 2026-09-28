import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOrganizationEditor } from "@/components/admin-organization-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminOrganizationFundraising } from "@/components/admin-organization-fundraising";
import { AdminOrganizationLocations } from "@/components/admin-organization-locations";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
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
  const [duplicateWarning, automationSuggestions] = await Promise.all([
    getCanonicalDraftDuplicateWarning("ORGANIZATION", organization.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "ORGANIZATION", canonicalEntityId: organization.id }),
  ]);

  return <AdminShell
    user={user}
    eyebrow="Organizácie · Detail"
    title={organization.name}
    description="Canonical údaje, lokality a fundraising na jednom admin detaile. Publication lifecycle zostáva explicitná samostatná akcia."
   actions={<Link href="/admin/organizacie">← Späť na organizácie</Link>}>
    <AdminCanonicalDraftWarning warning={duplicateWarning} />
    <AdminOrganizationEditor organization={organization} automationSuggestions={automationSuggestions} />
    <div id="locations"><AdminOrganizationLocations organization={organization} initialLocations={locations} /></div>
    <div id="fundraising"><AdminOrganizationFundraising organization={organization} initialMethods={methods} /></div>
  </AdminShell>;
}
