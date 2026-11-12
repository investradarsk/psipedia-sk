import Link from "next/link";
import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminOrganizationPublicationDashboard } from "@/components/admin-organization-publication-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { parseOrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import { getOrganizationAdminPage } from "@/lib/help-organization-admin-store";
import styles from "@/components/admin-organization-publication.module.css";

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
    eyebrow="Pomoc psom"
    title="Organizácie"
    description="Canonical organization management: vyhľadávanie, filtre, editácia, lokality, fundraising a jasný publication lifecycle."
    actions={<Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/organizacie/novy">+ Nová organizácia</Link>}
  >
    <Suspense fallback={<AdminDataLoading label="Organizácie" />}>
      <OrganizationList promise={pagePromise} filters={filters} />
    </Suspense>
  </AdminShell>;
}
