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

  return (
    <AdminShell
      user={user}
      eyebrow="Atlas plemien"
      title="Plemená"
      description="Pridávaj profily plemien, upravuj ich údaje a rozhodni, ktoré sú verejné."
      actions={<><Link href="/admin/plemena/audit">Audit údajov</Link><Link className="admin-primary-action" href="/admin/plemena/novy">+ Nové plemeno</Link></>}
    >
      {(env as unknown as {NOTION_BREED_WORKCOPY_BASELINE_ENABLED?: string})
        .NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "true" &&
        <AdminBreedWorkcopyBaseline />}
      <AdminBreedIdentityBackfill />
      <Suspense fallback={<AdminDataLoading label="Plemená" />}>
        <BreedList promise={breedsPromise} />
      </Suspense>
    </AdminShell>
  );
}
