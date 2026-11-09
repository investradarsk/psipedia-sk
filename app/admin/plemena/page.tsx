import Link from "next/link";
import { Suspense } from "react";
import { AdminBreedDashboard } from "@/components/admin-breed-dashboard";
import { AdminBreedIdentityBackfill } from "@/components/admin-breed-identity-backfill";
import { AdminBreedWorkcopyBaseline } from "@/components/admin-breed-workcopy-baseline";
import { AdminBreedWorkcopyActivation } from "@/components/admin-breed-workcopy-activation";
import { AdminBreedWorkcopyLiveStatus } from "@/components/admin-breed-workcopy-live-status";
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
    NOTION_BREED_SYNC_ENABLED?: string;
    NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
    NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED?: string;
  };
  const enableInitialBaseline = flags.NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "true";
  // Rendering is time-independent; the POST route enforces the hard expiry.
  const enableRebaseline = flags.NOTION_BREED_WORKCOPY_REBASELINE_ENABLED === "true";
  const enableActivation = flags.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED === "true" &&
    flags.NOTION_BREED_SYNC_ENABLED === "false" &&
    flags.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "false";
  const showLiveSyncStatus = flags.NOTION_BREED_SYNC_ENABLED === "false" &&
    flags.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "true";

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
      {enableActivation && <AdminBreedWorkcopyActivation />}
      {showLiveSyncStatus && <AdminBreedWorkcopyLiveStatus />}
      <AdminBreedIdentityBackfill />
      <Suspense fallback={<AdminDataLoading label="Plemená" />}>
        <BreedList promise={breedsPromise} />
      </Suspense>
    </AdminShell>
  );
}
