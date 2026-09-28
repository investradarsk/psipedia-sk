import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewDirectoryProfilePage() {
  const user = await requireAdminPageUser("/admin/adresar/novy");
  return <AdminShell user={user} eyebrow="Nový profil" title="Pridaj profil do adresára" description="Vyplň lokalitu, služby a interný kontakt. Kým profil nepublikuješ, verejnosť ho neuvidí."><AdminDirectoryEditor /></AdminShell>;
}
