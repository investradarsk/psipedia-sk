import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { AdminMissingQualityDashboard } from "@/components/admin-missing-quality-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getQualityMissingDatabase, loadMissingQualityDashboard } from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";

async function QualityContent({ promise }: { promise: ReturnType<typeof loadMissingQualityDashboard> }) {
  return <AdminMissingQualityDashboard data={await promise} />;
}

export default async function AdminDataQualityPage() {
  const user = await requireAdminPageUser("/admin/kvalita");
  const dataPromise = loadMissingQualityDashboard(getQualityMissingDatabase());

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Kvalita údajov"
      title="Kvalita údajov"
      description="Nájdené chýbajúce údaje v existujúcich profiloch. Schváľ alebo zamietni návrhy."
    >
      <Suspense fallback={<AdminDataLoading label="Kvalita údajov" />}>
        <QualityContent promise={dataPromise} />
      </Suspense>
    </AdminShell>
  );
}
