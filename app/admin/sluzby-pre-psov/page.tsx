import { AdminSectionHub } from "@/components/admin-section-hub";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic = "force-dynamic";

export default async function AdminDogServicesPage() {
  const user = await requireAdminPageUser("/admin/sluzby-pre-psov");
  const items = directoryCategories.map((category) => ({
    label: category.label,
    description: category.description,
    icon: category.icon,
    href: `/admin/adresar?category=${category.slug}`,
  }));

  return (
    <AdminShell
      user={user}
      eyebrow="Služby pre psov"
      title="Služby pre psov"
      description="Rovnaké kategórie ako na verejnom webe. Vyber kategóriu a spravuj jej profily."
    >
      <AdminSectionHub items={items} />
    </AdminShell>
  );
}
