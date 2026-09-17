import { notFound } from "next/navigation";
import { AdminOrganizationFundraising } from "@/components/admin-organization-fundraising";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import { listOrganizationFundraisingMethodsAdmin } from "@/lib/organization-fundraising-admin-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function OrganizationAdminDetailPage({ params }: Props) {
  const { id } = await params;
  const organizationId = Number(id);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) notFound();
  const user = await requireAdminPageUser(`/admin/organizacie/${id}`);
  const [organization, methods] = await Promise.all([
    getOrganizationPublicationAdminById(organizationId),
    listOrganizationFundraisingMethodsAdmin(organizationId),
  ]);
  if (!organization) notFound();

  return <AdminShell
    user={user}
    eyebrow="Organizácie · Fundraising"
    title={organization.name}
    description="Canonical fundraising metódy organizácie. Uloženie nemení verification na VERIFIED; nové metódy vždy vzniknú ako neaktívne a UNVERIFIED."
  >
    <AdminOrganizationFundraising organization={organization} initialMethods={methods} />
  </AdminShell>;
}
