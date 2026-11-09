import Link from "next/link";
import { Suspense } from "react";
import { AdminBreedDashboard } from "@/components/admin-breed-dashboard";
import { AdminBreedIdentityBackfill } from "@/components/admin-breed-identity-backfill";
import { AdminBreedWorkcopyBaseline } from "@/components/admin-breed-workcopy-baseline";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedBreedSummaries } from "@/lib/breed-store";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

async function BreedList({ promise }: { promise: ReturnType<typeof listManagedBreedSummaries> }) {
  return <AdminBreedDashboard initialBreeds={await promise} />;
}

export default async function AdminBreedsPage() {
  const user = await requireAdminPageUser("/admin/plemena");
  // Fetch the same bounded projection, but do not block the shared navigation.
  const breedsPromise = listManagedBreedSummaries();
  const flags = env as unknown as {
    NOTION_BREED_WORKCOPY_BASELINE_ENABLED?: string;
    NOTION_BREED_WORKCOPY_REBASELINE_ENABLED?: string;
  };
  const enableInitialBaseline = flags.NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "true";
  const enableRebaseline = flags.NOTION_BREED_WORKCOPY_REBASELINE_ENABLED === "true"
    && Date.now() <= Date.parse("2026-11-16T23:59:59Z");

  return (
    <AdminShell
      user={user}
      eyebrow="Atlas plemien"
      title="Plemená"
      description="Pridávaj profily plemien, upravuj ich údaje a rozhodni, ktoré sú verejné."
      actions={<><Link href="/admin/plemena/audit">Audit údajov</Link><Link className="admin-primary-action" href="/admin/plemena/novy">+ Nové plemeno</Link></>}
    >
      {(enableInitialBaseline || enableRebaseline) &&
        <AdminBreedWorkcopyBaseline
          showInitial={enableInitialBaseline}
          showRefresh={enableRebaseline}
        />}
      <AdminBreedIdentityBackfill />
      <Suspense fallback={<AdminDataLoading label="Plemená" />}>
        <BreedList promise={breedsPromise} />
      </Suspense>
    </AdminShell>
  );
}
