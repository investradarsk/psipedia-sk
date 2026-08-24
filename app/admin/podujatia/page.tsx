import Link from "next/link";
import { AdminEventDashboard } from "@/components/admin-event-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedEventSummaries } from "@/lib/event-store";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const user = await requireAdminPageUser("/admin/podujatia");
  return (
    <AdminShell user={user} eyebrow="Kalendár podujatí" title="Termíny pod kontrolou" description="Pridávaj výstavy, preteky, semináre a tréningy. Zverejnené podujatia sa okamžite ukážu v kalendári." actions={<Link className="admin-primary-action" href="/admin/podujatia/nove">+ Nové podujatie</Link>}>
      <AdminEventDashboard initialEvents={await listManagedEventSummaries()} />
    </AdminShell>
  );
}
