import Link from "next/link";
import { Suspense } from "react";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseDirectoryAdminFilters } from "@/lib/directory-admin-query";
import { getManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import { isDirectoryCategory } from "@/lib/directory";
import styles from "@/components/admin-directory-dashboard.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type DirectoryFilters = ReturnType<typeof parseDirectoryAdminFilters>;

async function DirectoryList({
  dataPromise,
  filters,
}: {
  dataPromise: ReturnType<typeof getManagedDirectoryAdminPage>;
  filters: DirectoryFilters;
}) {
  const data = await dataPromise;
  return <AdminDirectoryDashboard data={data} filters={filters} />;
}

export default async function AdminDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/adresar");
  const params = await searchParams;
  const filters = parseDirectoryAdminFilters(
    { get: (key) => typeof params[key] === "string" ? params[key] : null },
    isDirectoryCategory,
  );
  const dataPromise = getManagedDirectoryAdminPage(filters);

  return (
    <AdminShell
      user={user}
      eyebrow="Služby pre psov"
      title="Profily a služby"
      description="Pridávaj veterinárov, trénerov, školy, kluby a ďalšie služby. Verejné sú iba publikované profily."
      actions={<><Link className="admin-secondary-action" href="/admin/adresar/navrhy">Návrhy úprav</Link><Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/adresar/novy">+ Nový profil</Link></>}
    >
      <Suspense fallback={<AdminDataLoading label="Profily a služby" />}>
        <DirectoryList dataPromise={dataPromise} filters={filters} />
      </Suspense>
    </AdminShell>
  );
}
