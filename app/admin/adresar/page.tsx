import Link from "next/link";
import { Suspense } from "react";
import { AdminDirectoryCategoryNav } from "@/components/admin-directory-module-nav";
import { AdminProfileActions, AdminProfileTypeTabs } from "@/components/admin-profile-type-tabs";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseDirectoryAdminFilters } from "@/lib/directory-admin-query";
import { getManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import { isDirectoryCategory } from "@/lib/directory";
import { profileWorkspace } from "@/lib/admin-profile-workspace";

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
      {...profileWorkspace("services")}
    actions={<AdminProfileActions active="services"><Link className="admin-secondary-action" href="/admin/adresar/migracia">Duplicity a migrácia</Link></AdminProfileActions>}
    >
      <AdminProfileTypeTabs active="services" />
      <AdminDirectoryCategoryNav filters={filters} />
      <Suspense fallback={<AdminDataLoading label="Profily a služby" />}>
        <DirectoryList dataPromise={dataPromise} filters={filters} />
      </Suspense>
    </AdminShell>
  );
}
