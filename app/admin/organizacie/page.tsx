import Link from "next/link";
import { AdminProfileActions, AdminProfileTypeTabs } from "@/components/admin-profile-type-tabs";
import { profileWorkspace, profileQuickHref } from "@/lib/admin-profile-workspace";
import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminOrganizationPublicationDashboard } from "@/components/admin-organization-publication-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { parseOrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import { getOrganizationAdminPage } from "@/lib/help-organization-admin-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

async function OrganizationList({ promise, filters }: {
  promise: ReturnType<typeof getOrganizationAdminPage>;
  filters: ReturnType<typeof parseOrganizationAdminFilters>;
}) {
  const data = await promise;
  const reviewedIds = await listReviewedAdminEntityIds("ORGANIZATION", data.items.map((item) => item.id)).catch(() => null);
  return <>
    {reviewedIds === null && <p role="alert">Stav redakčnej kontroly nie je dostupný; nezobrazuje sa ako neoverený.</p>}
    <AdminOrganizationPublicationDashboard data={data} filters={filters} reviewedIds={reviewedIds} />
  </>;
}

export default async function OrganizationPublicationAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/organizacie");
  const params = await searchParams;
  const filters = parseOrganizationAdminFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  // The primary list is not needed to stream navigation and actions.
  const pagePromise = getOrganizationAdminPage(filters);

  return <AdminShell
    user={user}
    {...profileWorkspace("organizacie")}
    actions={<AdminProfileActions active="organizacie"><Link className="admin-secondary-action" prefetch={false} href={profileQuickHref(filters.type === "SHELTER" ? "utulky" : "organizacie", filters.q)}>Rýchla úprava</Link></AdminProfileActions>}
  >
    <AdminProfileTypeTabs active="organizacie" />
    <Suspense fallback={<AdminDataLoading label="Organizácie" />}>
      <OrganizationList promise={pagePromise} filters={filters} />
    </Suspense>
  </AdminShell>;
}
