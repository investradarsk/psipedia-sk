import { AdminShell } from "@/components/admin-shell";
import { AdminLinkHealthChecker } from "@/components/admin-link-health-checker";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLinkHealthPage() {
  const user = await requireAdminPageUser("/admin/kontrola-odkazov");
  return (
    <AdminShell
      user={user}
      eyebrow="Kvalita webu"
      title="Kontrola nefunkčných odkazov"
      description="Nájdi nefunkčné interné odkazy a ich zdrojové stránky. Kontroly sú iba na čítanie, nič sa samo nemaže ani neupravuje."
    >
      <AdminLinkHealthChecker />
    </AdminShell>
  );
}
