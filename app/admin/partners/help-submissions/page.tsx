import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerHelpCreateAdmin } from "@/lib/partner-help-create";
import "../partners.css";

export const dynamic = "force-dynamic";

const types = {
  ADOPTION_DOG: "Adopcia psa",
  LOST_FOUND_DOG: "Stratený / nájdený pes",
  HELP_CASE: "Ostatná pomoc psom",
} as const;
type Filters = { status?: string | string[] };
export default async function Page({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await requireAdminPageUser("/admin/partners/help-submissions");
  const filters = await searchParams;
  const status = typeof filters.status === "string" ? filters.status : "active";
  const all = await listPartnerHelpCreateAdmin();
  const items = all.filter(item => status === "all" || (status === "active" ? item.canWithdraw : item.status === status));
  return <AdminShell user={user} eyebrow="Partner platforma" title="Nové záznamy Pomoci psom"
    description="Schvaľovanie nových adopcií, stratených a nájdených psov a ostatnej pomoci. Skontrolujte návrh, upravte verejné údaje a vytvorte nezverejnený koncept alebo ho prepojte s existujúcim záznamom.">
    <section className="admin-form-card">
      <form className="admin-commercial-filters" role="search">
        <label>Stav<select name="status" defaultValue={status}>
          <option value="active">Čakajúce</option><option value="all">Všetky</option>
          <option value="SUBMITTED">Odoslané</option><option value="PENDING_REVIEW">V kontrole</option>
          <option value="QUARANTINED">Pozastavené</option><option value="APPROVED">Schválené</option>
          <option value="REJECTED">Zamietnuté</option><option value="WITHDRAWN">Stiahnuté</option>
        </select></label><button type="submit">Filtrovať</button>
      </form>
      <div className="admin-commercial-list" data-admin-community-list aria-label="Nové návrhy Pomoci psom">
        {items.length ? items.map(item=><article key={item.id} className={item.risks.length?"admin-partner-conflict-row":undefined}>
          <div><strong><Link href={`/admin/partners/help-submissions/${item.id}`}>{item.title}</Link></strong><small>{types[item.resourceType]} · Partner {item.accountId}</small></div>
          <span>{item.statusLabel}</span><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
          {item.risks.length ? <p>⚠ Možná duplicita – porovnať s existujúcimi záznamami pred schválením.</p> : null}
          <p><Link href={`/admin/partners/help-submissions/${item.id}`}>{item.canWithdraw?"Skontrolovať a rozhodnúť →":"Detail rozhodnutia →"}</Link></p>
          <details><summary>Zobraziť navrhované údaje</summary>
            <dl>{Object.entries(item.payload).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null?"—":String(value)}</dd></div>)}</dl>
          </details>
        </article>) : <p>Žiadne návrhy zodpovedajúce filtru.</p>}
      </div>
    </section>
  </AdminShell>;
}
