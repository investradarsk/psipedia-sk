import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerProfileChangesAdmin } from "@/lib/partner-profile-changes-admin";
import "../partners.css";

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
      description="Moderované návrhy zmien existujúcich profilov. Canonical údaje sa menia iba po explicitnom schválení."
    >
      <section className="admin-form-card">
        <form className="admin-commercial-filters">
          <label>Stav<select name="status" defaultValue={status}>
            <option value="active">Aktívne</option><option value="all">Všetky</option>
            <option value="SUBMITTED">SUBMITTED</option><option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="QUARANTINED">QUARANTINED</option><option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option><option value="WITHDRAWN">WITHDRAWN</option>
          </select></label>
          <label>Typ<select name="type" defaultValue={resourceType}>
            <option value="all">Všetky</option><option value="DIRECTORY_PROFILE">Directory profile</option>
            <option value="HELP_ORGANIZATION">Help organization</option>
          </select></label>
          <label>Riziko<select name="risk" defaultValue={risk}>
            <option value="all">Všetky</option><option value="STALE_BASE">STALE_BASE</option>
            <option value="NAME_CHANGE">NAME_CHANGE</option><option value="ADDRESS_CHANGE">ADDRESS_CHANGE</option>
            <option value="WEBSITE_CHANGE">WEBSITE_CHANGE</option><option value="SENSITIVE_CONTACT_CHANGE">SENSITIVE_CONTACT_CHANGE</option>
          </select></label>
          <label>Hľadať<input name="q" defaultValue={q} /></label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list">
          {items.length ? items.map((item) => (
            <article key={item.id} className={item.riskFlags.length ? "admin-partner-conflict-row" : undefined}>
              <div><strong>{item.resourceName}</strong><small>{item.email} · {item.resourceType}</small></div>
              <span>{item.status}</span>
              <span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
              <p>{item.changedFields.length} zmenených polí{item.riskFlags.length ? ` · ⚠ ${item.riskFlags.join(", ")}` : ""}</p>
              <Link href={`/admin/partners/changes/${item.id}`}>Detail →</Link>
            </article>
          )) : <p>Žiadne návrhy úprav pre zvolený filter.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
