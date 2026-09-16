import Link from "next/link";
import { AdminPuppyCoverage } from "@/components/admin-puppy-coverage";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { buildPuppyCoverageMatrix } from "@/lib/puppy-coverage";
import { getPuppyCoverageSource } from "@/lib/puppy-coverage-store";

export const dynamic = "force-dynamic";

export default async function AdminPuppyCoveragePage() {
  const user = await requireAdminPageUser("/admin/steniatka/pokrytie");
  const source = await getPuppyCoverageSource();
  const rows = buildPuppyCoverageMatrix(source.areas, source.articles);

  return (
    <AdminShell
      user={user}
      eyebrow="Redakčné plánovanie"
      title="Pokrytie obsahu: Šteniatka"
      description="Read-only prehľad existujúcej taxonómie a článkov. Coverage sa odvodzuje výhradne z priradenej oblasti a publikačného statusu."
      actions={<Link className="admin-primary-action" href="/admin/novy?sekcia=steniatka">+ Nový článok o šteniatkach</Link>}
    >
      <AdminPuppyCoverage rows={rows} />
    </AdminShell>
  );
}
