import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerProfileChangesAdmin } from "@/lib/partner-profile-changes-admin";
import "../partners.css";
import { partnerAdminStatusLabel, partnerAdminResourceLabel, partnerAdminRiskLabel } from "@/lib/admin-partner-labels";

export const dynamic = "force-dynamic";

type Search = {
  status?: string | string[];
  type?: string | string[];
  q?: string | string[];
  risk?: string | string[];
};

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners/changes");
  const raw = await searchParams;
  const status = typeof raw.status === "string" ? raw.status : "active";
  const resourceType = typeof raw.type === "string" ? raw.type : "all";
  const q = typeof raw.q === "string" ? raw.q : "";
  const risk = typeof raw.risk === "string" ? raw.risk : "all";
  const items = await listPartnerProfileChangesAdmin({ status, resourceType, q, risk });

  return (
    <AdminShell
      user={user}
      eyebrow="Partner platforma"
      title="Úpravy profilov"
      description="Skontroluj návrhy úprav existujúcich profilov. Zmeny sa prejavia až po schválení."
    >
      <section className="admin-form-card">
        <form className="admin-commercial-filters" role="search" aria-label="Filtrovať návrhy úprav profilov" data-admin-list-filters>
          <label>Stav<select name="status" defaultValue={status}>
            <option value="active">Aktívne</option><option value="all">Všetky</option>
            <option value="SUBMITTED">Odoslané</option><option value="PENDING_REVIEW">Čaká na kontrolu</option>
            <option value="QUARANTINED">Pozastavené na kontrolu</option><option value="APPROVED">Schválené</option>
            <option value="REJECTED">Zamietnuté</option><option value="WITHDRAWN">Stiahnuté</option>
          </select></label>
          <label>Typ<select name="type" defaultValue={resourceType}>
            <option value="all">Všetky</option><option value="DIRECTORY_PROFILE">Profil služby</option>
            <option value="HELP_ORGANIZATION">Organizácia pomoci psom</option>
          </select></label>
          <label>Riziko<select name="risk" defaultValue={risk}>
            <option value="all">Všetky</option><option value="STALE_BASE">Zastaralý pôvodný údaj</option>
            <option value="NAME_CHANGE">Zmena názvu</option><option value="ADDRESS_CHANGE">Zmena adresy</option>
            <option value="WEBSITE_CHANGE">Zmena webu</option><option value="SENSITIVE_CONTACT_CHANGE">Zmena kontaktných údajov</option>
          </select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list" data-admin-community-list aria-label="Návrhy úprav profilov">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.riskFlags.length ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {partnerAdminResourceLabel(item.resourceType)}</small></div>
              <span>{partnerAdminStatusLabel(item.status)}</span>
              <span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
              <p>{item.changedFields.length} zmenených polí{item.riskFlags.length ? ` · ⚠ ${item.riskFlags.map(partnerAdminRiskLabel).join(", ")}` : ""}</p>
              <Link href={`/admin/partners/changes/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne návrhy úprav pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
