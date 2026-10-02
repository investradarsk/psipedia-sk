import { AdminSectionVisuals } from "@/components/admin-section-visuals";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { buildSectionVisualRegistry } from "@/lib/section-visual-contract";
import { listStoredSectionVisuals, resolveSectionVisualList } from "@/lib/section-visual-store";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function AdminSectionVisualsPage() {
  const user = await requireAdminPageUser("/admin/sekcie/vizualy");
  const sections = await listManagedPortalSections();
  const definitions = buildSectionVisualRegistry(sections);
  const visuals = resolveSectionVisualList(definitions, await listStoredSectionVisuals());

  return (
    <AdminShell
      user={user}
      eyebrow="Štruktúra portálu"
      title="Vizuály sekcií"
      description="Nahraj jeden kvalitný originál a nastav samostatný výrez pre desktop a mobil bez práce s URL alebo CSS."
    >
      <AdminSectionVisuals initialVisuals={visuals} />
    </AdminShell>
  );
}
