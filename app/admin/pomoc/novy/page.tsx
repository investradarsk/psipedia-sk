import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewHelpCasePage() {
  const user = await requireAdminPageUser("/admin/pomoc/novy");
  return <AdminShell user={user} eyebrow="Nový prípad" title="Pridaj pomoc, ktorá má jasný cieľ" description="Kým prípad nepublikuješ, verejnosť ho neuvidí. Zbierka musí mať overený odkaz a cieľ."><AdminHelpEditor /></AdminShell>;
}
