import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerVerificationsAdmin } from "@/lib/partner-claims-admin";
import "../partners.css";

export const dynamic = "force-dynamic";
type Search = { status?: string | string[]; q?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners/verifications");
  const raw = await searchParams;
  const status = typeof raw.status === "string" ? raw.status : "PENDING_VERIFICATION";
  const q = typeof raw.q === "string" ? raw.q : "";
  const items = await listPartnerVerificationsAdmin({ status, q });

  return (
    <AdminShell user={user} eyebrow="Partner platforma" title="Overenia správcov" description="Samostatné overenie oprávnenia Partnera spravovať resource. Nie je to Premium, Sponsored ani hodnotenie kvality.">
      <section className="admin-form-card">
        <form className="admin-commercial-filters">
          <label>Stav<select name="status" defaultValue={status}><option value="all">Všetky</option><option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option><option value="VERIFIED">VERIFIED</option><option value="REJECTED">REJECTED</option></select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.conflict ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {item.entityType}</small></div>
              <span>{item.status}</span>
              <span>{item.submittedAt ? new Date(item.submittedAt).toLocaleString("sk-SK") : "—"}</span>
              <p>{item.conflict ? "⚠ Ownership konflikt" : `Membership: ${item.membershipRole ?? "none"}`}</p>
              <Link href={`/admin/partners/verifications/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne overenia pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
