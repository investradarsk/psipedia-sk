import { AdminSectionEditor } from "@/components/admin-section-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedPortalSectionArticleCounts, listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function AdminSectionsPage() {
  const user = await requireAdminPageUser("/admin/sekcie");
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
      <AdminSectionEditor initialSections={sections} articleCounts={articleCounts} />
    </AdminShell>
  );
}
