import { AdminOrganizationEditor } from "@/components/admin-organization-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewOrganizationAdminPage() {
  const user = await requireAdminPageUser("/admin/organizacie/novy");
  return <AdminShell
    user={user}
    eyebrow="Organizácie · Nový záznam"
    title="Nová organizácia"
    description="Ručne vytvorený canonical záznam vznikne vždy ako DRAFT. Publikovanie je samostatný krok."
  >
    <AdminOrganizationEditor />
  </AdminShell>;
}
