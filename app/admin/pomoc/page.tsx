import Link from "next/link";
import { AdminProfileActions, AdminProfileTypeTabs } from "@/components/admin-profile-type-tabs";
import { profileWorkspace, profileQuickHref } from "@/lib/admin-profile-workspace";
import { Suspense } from "react";
import { AdminHelpDashboard } from "@/components/admin-help-dashboard";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { parseHelpAdminFilters } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";

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
    {...profileWorkspace("ostatna-pomoc")}
    actions={<AdminProfileActions active="ostatna-pomoc"><Link className="admin-secondary-action" prefetch={false} href={profileQuickHref(filters.category === "all" ? "ostatna-pomoc" : filters.category, filters.q)}>Rýchla úprava</Link></AdminProfileActions>}
  >
    <AdminProfileTypeTabs active="ostatna-pomoc" />
    <Suspense fallback={<AdminDataLoading label="Pomoc psom" />}>
      <HelpContent promise={overviewPromise} filters={filters} selectionKey={selectionKey} />
    </Suspense>
  </AdminShell>;
}
