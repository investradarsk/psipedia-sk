import { AdminSectionEditor } from "@/components/admin-section-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedPortalSections } from "@/lib/section-store";
export const dynamic = "force-dynamic";
export default async function AdminSectionsPage() {
  const user = await requireAdminPageUser("/admin/sekcie");
  return <AdminShell user={user} eyebrow="Štruktúra portálu" title="Sekcie a podsekcie" description="Meníš tu názvy, úvodné texty, podsekcie, viditeľnosť aj poradie verejných obsahových sekcií."><AdminSectionEditor initialSections={await listManagedPortalSections()} /></AdminShell>;
}
