import Link from "next/link";
import {AdminShell} from "@/components/admin-shell";
import {requireAdminPageUser} from "@/lib/admin-auth";
import {getPartnerAdminSummary,listPartnerAccountsAdmin,normalizePartnerAccountAdminFilters} from "@/lib/partner-admin-store";
import {loadPartnerPendingSummary} from "@/lib/partner-attention";
import "./partners.css";
import { partnerAdminStatusLabel } from "@/lib/admin-partner-labels";

export const dynamic="force-dynamic";
type Search={q?:string|string[];status?:string|string[];verified?:string|string[];page?:string|string[];pageSize?:string|string[]};
const single=(value:string|string[]|undefined)=>typeof value==="string"?value:"";
export default async function Page({searchParams}:{searchParams:Promise<Search>}){
  const user=await requireAdminPageUser("/admin/partners");
  const raw=await searchParams;
  const filters=normalizePartnerAccountAdminFilters({
    q:single(raw.q),status:single(raw.status),verified:single(raw.verified),
    page:Number(single(raw.page)),pageSize:Number(single(raw.pageSize)),
  });
  // Missing page/pageSize use their default values, not Number("") === 0.
  const [summary,accounts,pending]=await Promise.all([
    getPartnerAdminSummary(),
    listPartnerAccountsAdmin({...filters,page:raw.page?filters.page:undefined,pageSize:raw.pageSize?filters.pageSize:undefined}),
    loadPartnerPendingSummary(),
  ]);
  const pageUrl=(page:number)=>{
    const params=new URLSearchParams();
    if(filters.q)params.set("q",filters.q);
    if(filters.status)params.set("status",filters.status);
    if(filters.verified)params.set("verified",filters.verified);
    params.set("pageSize",String(accounts.pageSize));
    params.set("page",String(page));
    return "/admin/partners?"+params.toString();
  };
  return <AdminShell user={user} eyebrow="Partner platforma" title="Partneri" description="Spravuj partnerské účty, prístup k profilom a čakajúce žiadosti.">
    <div className="admin-partner-stats" data-admin-community-metrics>{[["Účty",summary.accounts],["Aktívne",summary.active],["Suspendované",summary.suspended],["Deaktivované",summary.deactivated],["Profily",summary.resources],["Aktívne prístupy",summary.activeMemberships]].map(([l,v])=><article key={String(l)}><span>{l}</span><strong>{v}</strong></article>)}</div>
    <section className="admin-form-card" data-admin-partner-attention>
      <h2>Vyžaduje pozornosť</h2>
      <p>{pending.total===0?"Žiadne partnerské žiadosti momentálne nečakajú na spracovanie.":`${pending.total} položiek čaká na spracovanie.`}</p>
      <div className="admin-partner-pending"><Link href="/admin/partners/claims?status=PENDING">Prevzatie profilov {pending.claims} →</Link><Link href="/admin/partners/changes?status=active">Úpravy {pending.profileChanges} →</Link><Link href="/admin/partners/submissions?status=active">Nové profily {pending.newProfiles} →</Link><Link href="/admin/partners/events?status=active">Podujatia {pending.events} →</Link><Link href="/admin/partners/verifications?status=PENDING_VERIFICATION">Overenia {pending.verifications} →</Link><Link href="/admin/partners/commercial?status=NEW">Komerčné leady {pending.commercial} →</Link><Link href="/admin/partners/commercial">Komerčné dohody {pending.agreements} →</Link></div>
    </section>
    <section className="admin-form-card" data-admin-partner-accounts>
      <form className="admin-partner-search" role="search" aria-label="Filtrovať partnerské účty" data-admin-list-filters>
        <label htmlFor="partner-q">Hľadať účet
          <input id="partner-q" name="q" defaultValue={filters.q} maxLength={120} placeholder="E-mail alebo ID" />
        </label>
        <label htmlFor="partner-status">Stav účtu
          <select id="partner-status" name="status" defaultValue={filters.status}><option value="">Všetky stavy</option><option value="PENDING_VERIFICATION">Neoverené účty</option><option value="ACTIVE">Aktívne</option><option value="SUSPENDED">Suspendované</option><option value="DEACTIVATED">Deaktivované</option></select>
        </label>
        <label htmlFor="partner-verified">Overenie e-mailu
          <select id="partner-verified" name="verified" defaultValue={filters.verified}><option value="">Každé overenie</option><option value="VERIFIED">Overené e-maily</option><option value="UNVERIFIED">Neoverené e-maily</option></select>
        </label>
        <label htmlFor="partner-page-size">Počet na strane
          <select id="partner-page-size" name="pageSize" defaultValue={String(accounts.pageSize)}><option value="25">25 na strane</option><option value="50">50 na strane</option><option value="100">100 na strane</option></select>
        </label>
        <button type="submit">Hľadať</button>
      </form>
      <p role="status" data-admin-list-results>Výsledky: {accounts.total} · Strana {accounts.page} z {accounts.totalPages}</p>
      <div className="admin-partner-table" role="list" aria-label="Partnerské účty">
        {accounts.items.map(a=><article key={a.id} role="listitem"><div><strong>{a.email}</strong><small>{a.id}</small></div><span>{partnerAdminStatusLabel(a.status)}</span><span>{a.emailVerifiedAt?"Overený":"Neoverený"}</span><span>{a.activeMembershipCount} aktívnych prístupov</span><Link href={`/admin/partners/accounts/${a.id}`}>Detail →</Link></article>)}
      </div>
      {accounts.items.length===0&&<p>Nenašli sa žiadne účty pre zadané filtre.</p>}
      <nav className="admin-partner-pagination" aria-label="Stránkovanie partnerských účtov" data-admin-list-pagination>
        {accounts.page>1&&<Link href={pageUrl(accounts.page-1)}>← Predchádzajúca</Link>}
        {accounts.page<accounts.totalPages&&<Link href={pageUrl(accounts.page+1)}>Ďalšia →</Link>}
      </nav>
    </section>
  </AdminShell>;
}
