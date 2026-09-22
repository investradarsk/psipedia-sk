import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerClaimsAdmin } from "@/lib/partner-claims-admin";
import { partnerClaimStatuses } from "@/lib/partner-claims";
import "../partners.css";

export const dynamic = "force-dynamic";
type Search = { status?: string | string[]; type?: string | string[]; q?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners/claims");
  const raw = await searchParams;
  const status = typeof raw.status === "string" ? raw.status : "PENDING";
  const entityType = typeof raw.type === "string" ? raw.type : "all";
  const q = typeof raw.q === "string" ? raw.q : "";
  const items = await listPartnerClaimsAdmin({ status, entityType, q });

  return (
    <AdminShell user={user} eyebrow="Partner platforma" title="Claims" description="Žiadosti Partnerov o prevzatie existujúcich canonical profilov. Schválenie udeľuje OWNER membership, nie právo na priame canonical writes.">
      <section className="admin-form-card">
        <form className="admin-commercial-filters">
          <label>Stav<select name="status" defaultValue={status}><option value="all">Všetky</option>{partnerClaimStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Typ<select name="type" defaultValue={entityType}><option value="all">Všetky</option><option value="DIRECTORY_PROFILE">Directory profile</option><option value="HELP_ORGANIZATION">Help organization</option></select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.conflict ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {item.entityType}</small></div>
              <span>{item.status}</span>
              <span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
              <p>{item.conflict ? "⚠ Ownership konflikt" : item.requestMessage ?? "Bez správy"}</p>
              <Link href={`/admin/partners/claims/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne claims pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
