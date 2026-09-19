import { notFound } from "next/navigation";
import { AdminOrganizationEditor } from "@/components/admin-organization-editor";
import { AdminOrganizationFundraising } from "@/components/admin-organization-fundraising";
import { AdminOrganizationLocations } from "@/components/admin-organization-locations";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import { listOrganizationFundraisingMethodsAdmin } from "@/lib/organization-fundraising-admin-store";
import { listOrganizationLocationsAdmin } from "@/lib/organization-location-admin-store";

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

  return <AdminShell
    user={user}
    eyebrow="Organizácie · Detail"
    title={organization.name}
    description="Canonical údaje, lokality a fundraising na jednom admin detaile. Publication lifecycle zostáva explicitná samostatná akcia."
  >
    <AdminOrganizationEditor organization={organization} />
    <div id="locations"><AdminOrganizationLocations organization={organization} initialLocations={locations} /></div>
    <div id="fundraising"><AdminOrganizationFundraising organization={organization} initialMethods={methods} /></div>
  </AdminShell>;
}
