import Link from "next/link";
import { AdminHelpDashboard } from "@/components/admin-help-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseHelpAdminFilters } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";
import styles from "@/components/admin-help-bulk.module.css";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdminPageUser("/admin/pomoc");
  const params = await searchParams;
  const filters = parseHelpAdminFilters({ get: (key) => typeof params[key] === "string" ? params[key] : null });
  const data = await getManagedHelpDashboard(filters);
  const selectionKey = [filters.category, filters.status, filters.urgent, filters.state, filters.organization, filters.location, filters.q].join("|");
  return <AdminShell
    user={user}
    eyebrow="Pomoc psom"
    title="Help prípady a výzvy"
    description="Spravuj dočasnú opateru, zbierky, dobrovoľnícke výzvy a existujúce urgentné Help záznamy. Adopcie, stratené a nájdené psy aj organizácie majú vlastné canonical moduly."
    actions={<Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/pomoc/novy">+ Nový Help záznam</Link>}
  >
    <AdminHelpDashboard key={selectionKey} data={data} filters={filters} />
  </AdminShell>;
}
