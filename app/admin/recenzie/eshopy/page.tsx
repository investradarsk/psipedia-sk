import { publicationV3Enabled } from "@/lib/publication-readiness-v3";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminEshopNotionSyncButton } from "@/components/admin-eshop-notion-sync-button";
import { AdminEshopTable } from "./eshops-admin-table";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedEshops } from "@/lib/eshop-ratings";

export const dynamic = "force-dynamic";

export default async function AdminEshopsPage() {
  const user = await requireAdminPageUser("/admin/recenzie/eshopy");
  const shops = await listManagedEshops().catch(() => []);

  return (
    <AdminShell
      user={user}
      eyebrow="Recenzie a testy"
      title="E-shopy"
      description="Samostatné profily e-shopov a ich overené používateľské hodnotenia. Externé skóre sa do priemeru Psipedia nezapočítava."
      actions={<><AdminEshopNotionSyncButton /><Link className="admin-primary-action" href="/recenzie?typ=eshopy" target="_blank">Verejné e-shopy ↗</Link></>}
    >
      <AdminEshopTable shops={shops} bulkStatusEnabled={publicationV3Enabled()} />
    </AdminShell>
  );
}
