import { AdminNavigationEditor } from "@/components/admin-navigation-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getNavigationItems } from "@/lib/navigation-store";

export const dynamic = "force-dynamic";

export default async function AdminNavigationPage() {
  const user = await requireAdminPageUser("/admin/navigacia");
  return (
    <AdminShell
      user={user}
      eyebrow="Správa navigácie"
      title="Hlavné menu bez úpravy kódu"
      description="Premenuj, usporiadaj alebo skry položky a vytvor jednoduché podmenu. Po uložení sa zmena zobrazí na celom webe."
    >
      <AdminNavigationEditor initialItems={await getNavigationItems()} />
    </AdminShell>
  );
}
