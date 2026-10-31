import Link from "next/link";
import { Suspense } from "react";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminDirectoryCategoryNav, AdminDirectoryModuleNav } from "@/components/admin-directory-module-nav";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseDirectoryAdminFilters } from "@/lib/directory-admin-query";
import { getManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import { isDirectoryCategory } from "@/lib/directory";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminDogServicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/sluzby-pre-psov");
  const params = await searchParams;
  const filters = parseDirectoryAdminFilters(
    { get: (key) => typeof params[key] === "string" ? params[key] : null },
    isDirectoryCategory,
  );
  const dataPromise = getManagedDirectoryAdminPage(filters);
  return (
    <AdminShell
      user={user}
      eyebrow="Adresár"
      title="Služby pre psov"
      description="Všetky kategórie a profily v jednej modernej tabuľke. Úplné údaje sa upravujú v existujúcom editore."
      actions={<Link className="admin-primary-action" href="/admin/adresar/novy">+ Nový profil</Link>}
    >
      <AdminDirectoryModuleNav active="services" />
      <AdminDirectoryCategoryNav selected={filters.category} />
      <Suspense fallback={<AdminDataLoading label="Profily služieb" />}>
        <AdminServiceTable dataPromise={dataPromise} filters={filters} />
      </Suspense>
    </AdminShell>
  );
}

async function AdminServiceTable({ dataPromise, filters }: {
  dataPromise: ReturnType<typeof getManagedDirectoryAdminPage>;
  filters: ReturnType<typeof parseDirectoryAdminFilters>;
}) {
  const data = await dataPromise;
  return <AdminDirectoryDashboard data={data} filters={filters} basePath="/admin/sluzby-pre-psov" />;
}
