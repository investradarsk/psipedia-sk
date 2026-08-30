import { AdminDataImport } from "@/components/admin-data-import";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const user = await requireAdminPageUser("/admin/import");
  return (
    <AdminShell
      user={user}
      eyebrow="Bezpečný presun"
      title="Import pôvodných dát"
      description="Bezpečne importuj FCI plemená alebo prenes články, adresár, podujatia, pomoc psom a právne nastavenia do Cloudflare D1."
    >
      <AdminDataImport />
    </AdminShell>
  );
}
