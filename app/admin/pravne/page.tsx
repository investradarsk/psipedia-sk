import { AdminLegalSettings } from "@/components/admin-legal-settings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getLegalSettings } from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const user = await requireAdminPageUser("/admin/pravne");
  return (
    <AdminShell
      user={user}
      eyebrow="Právne centrum"
      title="Povinné údaje a registrácie"
      description="Doplň údaje prevádzkovateľa a sleduj kroky, ktoré sa vybavujú mimo webu. Uložené údaje sa zobrazia na verejnej stránke Právne informácie."
    >
      <AdminLegalSettings initialSettings={await getLegalSettings()} />
    </AdminShell>
  );
}
