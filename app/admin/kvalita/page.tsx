import { AdminShell } from "@/components/admin-shell";
import { AdminMissingQualityDashboard } from "@/components/admin-missing-quality-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getQualityMissingDatabase, loadMissingQualityDashboard } from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";

export default async function AdminDataQualityPage() {
  const user = await requireAdminPageUser("/admin/kvalita");
  const data = await loadMissingQualityDashboard(getQualityMissingDatabase());
  return (
    <AdminShell user={user} eyebrow="Admin · Kvalita údajov" title="Kvalita údajov"
      description="Nájdené chýbajúce údaje v existujúcich profiloch. Schváľ alebo zamietni návrhy.">
      <AdminMissingQualityDashboard data={data} />
    </AdminShell>
  );
}
