import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerNewProfilesAdmin } from "@/lib/partner-new-profile-admin";
import "../partners.css";
import { partnerAdminStatusLabel, partnerAdminResourceLabel, partnerAdminDuplicateLabel, partnerAdminRiskLabel } from "@/lib/admin-partner-labels";

export const dynamic="force-dynamic";
type Search={status?:string|string[];type?:string|string[];kind?:string|string[];duplicate?:string|string[];q?:string|string[]};

export default async function Page({searchParams}:{searchParams:Promise<Search>}){
  const user=await requireAdminPageUser("/admin/partners/submissions");
  const raw=await searchParams;
  const status=typeof raw.status==="string"?raw.status:"active";
  const resourceType=typeof raw.type==="string"?raw.type:"all";
  const categoryOrType=typeof raw.kind==="string"?raw.kind:"all";
  const duplicateConfidence=typeof raw.duplicate==="string"?raw.duplicate:"all";
  const q=typeof raw.q==="string"?raw.q:"";
  const items=await listPartnerNewProfilesAdmin({status,resourceType,categoryOrType,duplicateConfidence,q});
  const kinds=[...new Set(items.map((item)=>item.categoryOrType))].sort((a,b)=>a.localeCompare(b,"sk"));
  return <AdminShell user={user} eyebrow="Partner platforma" title="Nové profily" description="Posúď návrhy partnerov na nové profily. Profil vznikne až po schválení.">
    <section className="admin-form-card">
      <form className="admin-commercial-filters" role="search" aria-label="Filtrovať nové profily partnerov" data-admin-list-filters>
        <label>Stav<select name="status" defaultValue={status}><option value="active">Aktívne</option><option value="history">História</option><option value="all">Všetky</option><option value="SUBMITTED">Odoslané</option><option value="PENDING_REVIEW">Čaká na kontrolu</option><option value="QUARANTINED">Pozastavené na kontrolu</option><option value="APPROVED">Schválené</option><option value="REJECTED">Zamietnuté</option><option value="WITHDRAWN">Stiahnuté</option></select></label>
        <label>Typ<select name="type" defaultValue={resourceType}><option value="all">Všetky</option><option value="DIRECTORY_PROFILE">Profily služieb</option><option value="HELP_ORGANIZATION">Organizácie pomoci psom</option></select></label>
        <label>Kategória / typ<select name="kind" defaultValue={categoryOrType}><option value="all">Všetky</option>{kinds.map((kind)=><option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label>Možná duplicita<select name="duplicate" defaultValue={duplicateConfidence}><option value="all">Všetky</option><option value="HIGH">Vysoká zhoda</option><option value="MEDIUM">Možná zhoda</option><option value="NONE">Bez zhody</option></select></label>
        <label>Partner / profil<input name="q" defaultValue={q}/></label>
        <button>Filtrovať</button>
      </form>
      <div className="admin-commercial-list" data-admin-community-list aria-label="Návrhy nových profilov">
        {items.length?items.map((item)=><article key={item.id} className={item.duplicateConfidence==="HIGH"?"admin-partner-conflict-row":undefined}>
          <div><strong>{item.displayName}</strong><small>{item.email} · {partnerAdminResourceLabel(item.resourceType)}</small></div>
          <span>{partnerAdminStatusLabel(item.status)}</span><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
          <p>{item.categoryOrType} · zhoda: {partnerAdminDuplicateLabel(item.duplicateConfidence)}{item.riskFlags.length?` · ⚠ ${item.riskFlags.map(partnerAdminRiskLabel).join(", ")}`:""}</p>
          <Link href={`/admin/partners/submissions/${item.id}`}>Detail →</Link>
        </article>):<p>Žiadne návrhy nových profilov pre zvolený filter.</p>}
      </div>
    </section>
  </AdminShell>;
}
