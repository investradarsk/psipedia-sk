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
      description="Bezpečne importuj podporované JSON dáta cez validáciu, Preview a explicitné potvrdenie. Všeobecný import spracúva články, adresár, podujatia, pomoc psom a právne nastavenia; FCI plemená majú vlastný preview tok."
    >
      <AdminDataImport />
    </AdminShell>
  );
}
