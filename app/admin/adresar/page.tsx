import Link from "next/link";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseDirectoryAdminFilters } from "@/lib/directory-admin-query";
import { getManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import { isDirectoryCategory } from "@/lib/directory";
import styles from "@/components/admin-directory-dashboard.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/adresar");
  const params = await searchParams;
  const filters = parseDirectoryAdminFilters(
    { get: (key) => typeof params[key] === "string" ? params[key] : null },
    isDirectoryCategory,
  );
  const data = await getManagedDirectoryAdminPage(filters);

  return <AdminShell user={user} eyebrow="Služby pre psov" title="Profily a služby" description="Pridávaj veterinárov, trénerov, školy, kluby a ďalšie služby. Verejné sú iba publikované profily." actions={<><Link className="admin-secondary-action" href="/admin/adresar/navrhy">Návrhy úprav</Link><Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/adresar/novy">+ Nový profil</Link></>}><AdminDirectoryDashboard data={data} filters={filters} /></AdminShell>;
}
