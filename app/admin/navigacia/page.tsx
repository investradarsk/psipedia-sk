import { AdminNavigationEditor } from "@/components/admin-navigation-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getNavigationItems } from "@/lib/navigation-store";
import { portalSections } from "@/lib/portal";

export const dynamic = "force-dynamic";

const automaticSubmenuSlugs = new Set(["steniatka", "starostlivost", "aktivity"]);

function getAutomaticChildren() {
  const automaticChildren: Record<string, { id: string; label: string; href: string }[]> = {};

  for (const section of portalSections) {
    if (!automaticSubmenuSlugs.has(section.slug)) continue;
    automaticChildren[section.slug] = section.subpages
      .filter((subpage) => subpage.visible !== false)
      .map((subpage) => ({
        id: `portal-${section.slug}-${subpage.slug}`,
        label: subpage.label,
        href: subpage.href ?? `/${section.slug}/${subpage.slug}`,
      }));
  }

  return automaticChildren;
}

export default async function AdminNavigationPage() {
  const user = await requireAdminPageUser("/admin/navigacia");
  const items = await getNavigationItems();

  return (
    <AdminShell
      user={user}
      eyebrow="Správa navigácie"
      title="Hlavné menu bez úpravy kódu"
      description="Premenuj, usporiadaj alebo skry položky a vytvor jednoduché podmenu. Po uložení sa zmena zobrazí na celom webe."
    >
      <AdminNavigationEditor initialItems={items} automaticChildren={getAutomaticChildren()} />
    </AdminShell>
  );
}
