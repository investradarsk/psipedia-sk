import Link from "next/link";
import { AdminEventDashboard } from "@/components/admin-event-dashboard";
import styles from "@/components/admin-event-dashboard.module.css";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { listManagedEventPage } from "@/lib/event-store";
import { parseAdminEventListQuery } from "@/lib/admin-event-pagination";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const user = await requireAdminPageUser("/admin/podujatia");
  const initialPage = await listManagedEventPage(parseAdminEventListQuery(new URLSearchParams()));
  const reviewedIds = await listReviewedAdminEntityIds("EVENT", initialPage.events.map((event) => event.id));
  return (
    <AdminShell user={user} eyebrow="Kalendár podujatí" title="Termíny pod kontrolou" description="Pridávaj výstavy, preteky, semináre a tréningy. Zverejnené podujatia sa okamžite ukážu v kalendári." actions={<Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/podujatia/nove">+ Nové podujatie</Link>}>
      <AdminEventDashboard initialPage={initialPage} reviewedIds={reviewedIds} />
    </AdminShell>
  );
}
