import { AdminDataQualityDashboard } from "@/components/admin-data-quality-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadDataQualityDashboard } from "@/lib/data-quality-store";

export const dynamic = "force-dynamic";

export default async function AdminDataQualityPage() {
  const user = await requireAdminPageUser("/admin/kvalita");
  const data = await loadDataQualityDashboard();

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Kvalita údajov"
      title="Kvalita údajov"
      description="Chýbajúce údaje v profiloch a automatická kontrola log, obrázkov a ich pôvodných zdrojov."
    >
      <AdminDataQualityDashboard data={data} />
    </AdminShell>
  );
}
