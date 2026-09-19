import Link from "next/link";
import { AdminOrganizationPublicationDashboard } from "@/components/admin-organization-publication-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseOrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import { getOrganizationAdminPage } from "@/lib/help-organization-admin-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OrganizationPublicationAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/organizacie");
  const params = await searchParams;
  const filters = parseOrganizationAdminFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  const data = await getOrganizationAdminPage(filters);

  return <AdminShell
    user={user}
    eyebrow="Pomoc psom"
    title="Organizácie"
    description="Canonical organization management: vyhľadávanie, filtre, editácia, lokality, fundraising a jasný publication lifecycle."
    actions={<Link className="admin-primary-action" href="/admin/organizacie/novy">+ Nová organizácia</Link>}
  >
    <AdminOrganizationPublicationDashboard data={data} filters={filters} />
  </AdminShell>;
}
