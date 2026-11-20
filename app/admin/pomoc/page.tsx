import Link from "next/link";
import { Suspense } from "react";
import { AdminDirectoryModuleNav } from "@/components/admin-directory-module-nav";
import { AdminHelpDashboard } from "@/components/admin-help-dashboard";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { parseHelpAdminFilters } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";
import styles from "@/components/admin-help-bulk.module.css";

export const dynamic = "force-dynamic";

type HelpFilters = ReturnType<typeof parseHelpAdminFilters>;

async function loadHelpOverview(filters: HelpFilters) {
  const data = await getManagedHelpDashboard(filters);
  const reviewedIds = await listReviewedAdminEntityIds("HELP_CASE", data.items.map((item) => item.id));
  return { data, reviewedIds };
}

async function HelpContent({ promise, filters, selectionKey }: {
  promise: ReturnType<typeof loadHelpOverview>;
  filters: HelpFilters;
  selectionKey: string;
}) {
  const { data, reviewedIds } = await promise;
  return <AdminHelpDashboard key={selectionKey} data={data} filters={filters} reviewedIds={reviewedIds} />;
}

export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdminPageUser("/admin/pomoc");
  const params = await searchParams;
  const filters = parseHelpAdminFilters({ get: (key) => typeof params[key] === "string" ? params[key] : null });
  const overviewPromise = loadHelpOverview(filters);
  const selectionKey = [filters.category, filters.status, filters.urgent, filters.state, filters.organization, filters.location, filters.q].join("|");
  return <AdminShell
    user={user}
    eyebrow="Pomoc psom"
    title="Prípady a výzvy"
    description="Spravuj dočasnú opateru, zbierky a dobrovoľnícke výzvy. Adopcie, stratené a nájdené psy aj organizácie nájdeš v samostatných sekciách."
    actions={<Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/pomoc/novy">+ Nová výzva</Link>}
  >
    <AdminDirectoryModuleNav active="help" />
    <Suspense fallback={<AdminDataLoading label="Pomoc psom" />}>
      <HelpContent promise={overviewPromise} filters={filters} selectionKey={selectionKey} />
    </Suspense>
  </AdminShell>;
}
