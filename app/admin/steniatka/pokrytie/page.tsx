import Link from "next/link";
import { AdminPuppyCoverage } from "@/components/admin-puppy-coverage";
import styles from "@/components/admin-puppy-coverage.module.css";
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
      title="Pokrytie tém: Šteniatka"
      description="Redakčný prehľad ukazuje, ktoré oblasti už majú publikovaný obsah, ktoré sú rozpracované a kde obsah chýba. Stav sa odvodzuje iba z existujúcich článkov a nič tu nemení dáta."
      actions={<Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/novy?sekcia=steniatka">+ Nový článok o šteniatkach</Link>}
    >
      <AdminPuppyCoverage rows={rows} />
    </AdminShell>
  );
}
