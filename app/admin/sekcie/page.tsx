import Link from "next/link";
import { AdminSectionEditor } from "@/components/admin-section-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedPortalSectionArticleCounts, listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sekcia?: string | string[] }>;
}) {
  const user = await requireAdminPageUser("/admin/sekcie");
  const { sekcia } = await searchParams;
  const initialOpenSlug = Array.isArray(sekcia) ? sekcia[0] : sekcia;
  const [sections, articleCounts] = await Promise.all([
    listManagedPortalSections(),
    getManagedPortalSectionArticleCounts(),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Štruktúra portálu"
      title="Sekcie a podsekcie"
      description="Spravuj verejné názvy, úvody, poradie, viditeľnosť a podsekcie bez zásahu do kódu."
    >
      <p><Link href="/admin/sekcie/vizualy">Spravovať vizuály sekcií a podsekcií →</Link></p>
      <AdminSectionEditor initialSections={sections} articleCounts={articleCounts} initialOpenSlug={initialOpenSlug} />
    </AdminShell>
  );
}
