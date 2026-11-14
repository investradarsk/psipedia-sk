import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerClaimsAdmin } from "@/lib/partner-claims-admin";
import { partnerClaimStatuses } from "@/lib/partner-claims";
import "../partners.css";
import { partnerAdminResourceLabel, partnerAdminStatusLabel } from "@/lib/admin-partner-labels";

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
    <AdminShell user={user} eyebrow="Partner platforma" title="Prevzatie profilov" description="Posúď žiadosti partnerov o správu existujúcich profilov. Vlastníctvo iného správcu sa nemení automaticky.">
      <section className="admin-form-card">
        <form className="admin-commercial-filters" role="search" aria-label="Filtrovať žiadosti o prevzatie" data-admin-list-filters>
          <label>Stav<select name="status" defaultValue={status}><option value="all">Všetky</option>{partnerClaimStatuses.map((item) => <option key={item} value={item}>{partnerAdminStatusLabel(item)}</option>)}</select></label>
          <label>Typ<select name="type" defaultValue={entityType}><option value="all">Všetky</option><option value="DIRECTORY_PROFILE">Profil služby</option><option value="HELP_ORGANIZATION">Organizácia pomoci psom</option></select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list" data-admin-community-list aria-label="Žiadosti o prevzatie">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.conflict ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {partnerAdminResourceLabel(item.entityType)}</small></div>
              <span>{partnerAdminStatusLabel(item.status)}</span>
              <span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
              <p>{item.conflict ? "⚠ Konflikt správy profilu" : item.requestMessage ?? "Bez správy"}</p>
              <Link href={`/admin/partners/claims/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne žiadosti o prevzatie pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
