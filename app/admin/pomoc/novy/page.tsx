import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewHelpCasePage() {
  const user = await requireAdminPageUser("/admin/pomoc/novy");
  return <AdminShell
    user={user}
    eyebrow="Nový Help záznam"
    title="Pridaj výzvu, ktorá patrí do Help modulu"
    description="Dočasná opatera, zbierky a dobrovoľnícke výzvy sa najprv ukladajú ako koncept alebo sa publikujú vedomou redakčnou akciou. Adopcie, Lost/Found a organizácie používajú svoje samostatné admin moduly."
  >
    <AdminHelpEditor />
  </AdminShell>;
}
