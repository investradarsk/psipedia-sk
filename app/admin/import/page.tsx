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
      description="Prenes články, koncepty, adresár, podujatia, pomoc psom a právne nastavenia priamo do Cloudflare D1."
    >
      <AdminDataImport />
    </AdminShell>
  );
}
