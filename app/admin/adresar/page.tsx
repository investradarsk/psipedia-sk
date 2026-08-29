import Link from "next/link";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedDirectoryProfileSummaries } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export default async function AdminDirectoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdminPageUser("/admin/adresar");
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const result = await listManagedDirectoryProfileSummaries({ page });
  return <AdminShell user={user} eyebrow="Služby pre psov" title="Profily a služby" description="Pridávaj veterinárov, trénerov, školy, kluby a ďalšie služby. Verejné sú iba publikované profily." actions={<><Link className="admin-secondary-action" href="/admin/adresar/navrhy">Návrhy úprav</Link><Link className="admin-primary-action" href="/admin/adresar/novy">+ Nový profil</Link></>}><AdminDirectoryDashboard initialProfiles={result.profiles} initialCounts={result.counts} pagination={result.pagination} /></AdminShell>;
}
