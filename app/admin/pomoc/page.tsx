import Link from "next/link";
import { AdminHelpDashboard } from "@/components/admin-help-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseHelpAdminFilters } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdminPageUser("/admin/pomoc");
  const params = await searchParams;
  const filters = parseHelpAdminFilters({ get: (key) => typeof params[key] === "string" ? params[key] : null });
  const data = await getManagedHelpDashboard(filters);
  return <AdminShell user={user} eyebrow="Pomoc psom" title="Prípady a výzvy pod kontrolou" description="Spravuj adopcie, organizácie, dočasnú opateru, zbierky a možnosti pomoci." actions={<Link className="admin-primary-action" href="/admin/pomoc/novy">+ Nový prípad</Link>}><AdminHelpDashboard data={data} filters={filters} /></AdminShell>;
}
