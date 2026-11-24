import { qualityWorkspace } from "@/lib/admin-quality-workspace";
import { AdminQualityWorkspaceTabs } from "@/components/admin-quality-workspace-tabs";
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

export default async function AdminDataQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const user = await requireAdminPageUser("/admin/kvalita");
  const params = await searchParams;
  const parsed = Number(params.before);
  const before = params.before && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  const dataPromise = loadMissingQualityDashboard(getQualityMissingDatabase(), { before });

  return (
    <AdminShell
      user={user}
      {...qualityWorkspace("findings")}
    >
      <AdminQualityWorkspaceTabs active="findings" />
      <Suspense fallback={<AdminDataLoading label="Kvalita údajov" />}>
        <QualityContent promise={dataPromise} />
      </Suspense>
    </AdminShell>
  );
}
