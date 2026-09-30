import { AdminSectionHub, type AdminSectionHubItem } from "@/components/admin-section-hub";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { helpCategories } from "@/lib/help";

export const dynamic = "force-dynamic";

const hrefByCategory: Record<(typeof helpCategories)[number]["slug"], string> = {
  adopcia: "/admin/adopcie",
  utulky: "/admin/pomoc?category=utulky",
  "docasna-opatera": "/admin/pomoc?category=docasna-opatera",
  zbierky: "/admin/pomoc?category=zbierky",
  "stratene-a-najdene": "/admin/stratene-najdene",
  dobrovolnictvo: "/admin/pomoc?category=dobrovolnictvo",
};

export default async function AdminDogHelpPage() {
  const user = await requireAdminPageUser("/admin/pomoc-psom");
  const items: AdminSectionHubItem[] = helpCategories.map((category) => ({
    label: category.slug === "utulky" ? "Útulky" : category.label,
    description: category.slug === "utulky"
      ? "Správa útulkov podľa toho, čo reálne robia. Právna forma tu nie je pracovná kategória."
      : category.description,
    icon: category.icon,
    href: hrefByCategory[category.slug],
  }));

  return (
    <AdminShell
      user={user}
      eyebrow="Pomoc psom"
      title="Pomoc psom"
      description="Všetky agendy Pomoci psom na jednom mieste, usporiadané rovnako ako na verejnom webe."
    >
      <AdminSectionHub items={items} />
    </AdminShell>
  );
}
