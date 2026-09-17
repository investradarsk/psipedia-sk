import { AdminOrganizationPublicationDashboard } from "@/components/admin-organization-publication-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listOrganizationPublicationAdmin } from "@/lib/help-organization-admin-store";

export const dynamic = "force-dynamic";

export default async function OrganizationPublicationAdminPage() {
  const user = await requireAdminPageUser("/admin/organizacie");
  const items = await listOrganizationPublicationAdmin();

  return <AdminShell
    user={user}
    eyebrow="Pomoc psom"
    title="Organizácie"
    description="Úzky publication workflow pre canonical organizácie. READY/BLOCKED sa vždy počíta zo serverového contractu pred publikovaním."
  >
    <AdminOrganizationPublicationDashboard items={items} />
  </AdminShell>;
}
