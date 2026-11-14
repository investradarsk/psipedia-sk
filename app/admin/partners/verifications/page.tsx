import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerVerificationsAdmin } from "@/lib/partner-claims-admin";
import "../partners.css";
import { partnerAdminStatusLabel, partnerAdminResourceLabel, partnerAdminRoleLabel } from "@/lib/admin-partner-labels";

export const dynamic = "force-dynamic";
type Search = { status?: string | string[]; q?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners/verifications");
  const raw = await searchParams;
  const status = typeof raw.status === "string" ? raw.status : "PENDING_VERIFICATION";
  const q = typeof raw.q === "string" ? raw.q : "";
  const items = await listPartnerVerificationsAdmin({ status, q });

  return (
    <AdminShell user={user} eyebrow="Partner platforma" title="Overenia správcov" description="Over, či má partner oprávnenie spravovať profil. Overenie nezahŕňa platené zvýraznenie ani hodnotenie kvality.">
      <section className="admin-form-card">
        <form className="admin-commercial-filters" role="search" aria-label="Filtrovať overenia správcov" data-admin-list-filters>
          <label>Stav<select name="status" defaultValue={status}><option value="all">Všetky</option><option value="PENDING_VERIFICATION">Čaká na overenie</option><option value="VERIFIED">Overené</option><option value="REJECTED">Zamietnuté</option></select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list" data-admin-community-list aria-label="Overenia správcov">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.conflict ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {partnerAdminResourceLabel(item.entityType)}</small></div>
              <span>{partnerAdminStatusLabel(item.status)}</span>
              <span>{item.submittedAt ? new Date(item.submittedAt).toLocaleString("sk-SK") : "—"}</span>
              <p>{item.conflict ? "⚠ Konflikt správy profilu" : `Prístup: ${partnerAdminRoleLabel(item.membershipRole)}`}</p>
              <Link href={`/admin/partners/verifications/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne overenia pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
