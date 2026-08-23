import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await requireAdminPageUser("/admin/podujatia/nove");
  return <AdminShell user={user} eyebrow="Nové podujatie" title="Pridaj termín do kalendára" description="Vyplň termín, miesto a organizátora. Kým podujatie nepublikuješ, verejnosť ho neuvidí."><AdminEventEditor /></AdminShell>;
}
