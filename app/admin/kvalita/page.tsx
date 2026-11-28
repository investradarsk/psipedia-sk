import Link from "next/link";
import { AdminQualityFreshness } from "@/components/admin-quality-freshness";
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
  let data: Awaited<typeof promise>;
  try {
    data = await promise;
  } catch (error) {
    console.error("Quality proposal queue unavailable", error);
    return <p role="alert" className="admin-panel">Evidencia návrhov je nedostupná. Počty ani stav návrhov sa nepodarilo overiť.</p>;
  }
  return <AdminMissingQualityDashboard data={data} />;
}

export default async function AdminDataQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; aktualnost?: string; agenda?: string; strana?: string }>;
}) {
  const user = await requireAdminPageUser("/admin/kvalita");
  const params = await searchParams;
  const parsed = Number(params.before);
  const before = params.before && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  const dataPromise = Promise.resolve().then(() => loadMissingQualityDashboard(getQualityMissingDatabase(), { before }));

  return (
    <AdminShell
      user={user}
      {...qualityWorkspace("findings")}
    >
      <AdminQualityWorkspaceTabs active="findings" />
      {params.aktualnost==="1"?<Suspense fallback={<AdminDataLoading label="Kontrola aktuálnosti" />}><AdminQualityFreshness agenda={params.agenda??"directory"} page={Number(params.strana??1)}/></Suspense>:<p><Link href="/admin/kvalita?aktualnost=1#aktualnost" prefetch={false}>Skontrolovať aktuálnosť údajov</Link></p>}
      <Suspense fallback={<AdminDataLoading label="Kvalita údajov" />}>
        <QualityContent promise={dataPromise} />
      </Suspense>
    </AdminShell>
  );
}
