import { AdminShell } from "@/components/admin-shell";
import { AdminComponentRegistry } from "@/components/admin-component-registry";
import { requireAdminPageUser } from "@/lib/admin-auth";
import registry from "@/lib/generated/component-registry.json";

export const dynamic = "force-dynamic";

export default async function AdminComponentsPage() {
  const user = await requireAdminPageUser("/admin/komponenty");
  return (
    <AdminShell
      user={user}
      eyebrow="Technická dokumentácia"
      title="Komponenty a šablóny"
      description="Automatická mapa používania spoločných komponentov na verejnom webe a v administrácii. Údaje iba na čítanie."
    >
      <AdminComponentRegistry registry={registry as unknown as Parameters<typeof AdminComponentRegistry>[0]["registry"]} />
    </AdminShell>
  );
}
