import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAdoptionAdminBreedOptions, listAdoptionAdminOrganizationOptions } from "@/lib/adoption-admin-write";

export const dynamic = "force-dynamic";

export default async function NewAdoptionPage() {
  const user = await requireAdminPageUser("/admin/adopcie/novy");
  const [breeds, organizations] = await Promise.all([
    listAdoptionAdminBreedOptions(),
    listAdoptionAdminOrganizationOptions(),
  ]);
  return <AdminShell user={user} eyebrow="Adopcie" title="Pridať psa" description="Nový profil začína bezpečne ako koncept. Verejný stav je možný iba po splnení doménových validačných pravidiel."><AdminAdoptionEditor breeds={breeds} organizations={organizations}/></AdminShell>;
}
