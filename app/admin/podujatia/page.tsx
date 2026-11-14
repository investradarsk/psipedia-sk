import Link from "next/link";
import { Suspense } from "react";
import { AdminDirectoryModuleNav } from "@/components/admin-directory-module-nav";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminEventDashboard } from "@/components/admin-event-dashboard";
import styles from "@/components/admin-event-dashboard.module.css";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { listManagedEventPage } from "@/lib/event-store";
import { parseAdminEventListQuery } from "@/lib/admin-event-pagination";

export const dynamic = "force-dynamic";

async function loadEventOverview() {
  const initialPage = await listManagedEventPage(parseAdminEventListQuery(new URLSearchParams()));
  const reviewedIds = await listReviewedAdminEntityIds("EVENT", initialPage.events.map((event) => event.id));
  return { initialPage, reviewedIds };
}

async function EventsContent({ promise }: { promise: ReturnType<typeof loadEventOverview> }) {
  const { initialPage, reviewedIds } = await promise;
  return <AdminEventDashboard initialPage={initialPage} reviewedIds={reviewedIds} />;
}

export default async function AdminEventsPage() {
  const user = await requireAdminPageUser("/admin/podujatia");
  // The review lookup depends on the event ids; the shell does not.
  const overviewPromise = loadEventOverview();

  return (
    <AdminShell
      user={user}
      eyebrow="Správa kalendára"
      title="Podujatia"
      description="Spravuj výstavy, semináre, tréningy a ich publikovanie. Verejný kalendár si môžeš otvoriť na kontrolu."
      actions={<>
        <Link className="admin-secondary-action" href="/podujatia" target="_blank" rel="noreferrer">Verejný kalendár</Link>
        <Link className={`admin-primary-action ${styles.primaryAction}`} href="/admin/podujatia/nove">+ Nové podujatie</Link>
      </>}
    >
      <AdminDirectoryModuleNav active="events" />
      <Suspense fallback={<AdminDataLoading label="Podujatia" />}>
        <EventsContent promise={overviewPromise} />
      </Suspense>
    </AdminShell>
  );
}
