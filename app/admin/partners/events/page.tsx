import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerEventsAdmin } from "@/lib/partner-events-admin";
import { eventTypes, slovakRegions } from "@/lib/events";
import "../partners.css";
export const dynamic="force-dynamic";
type Search={status?:string|string[];operation?:string|string[];eventType?:string|string[];region?:string|string[];dateFrom?:string|string[];dateTo?:string|string[];attention?:string|string[];q?:string|string[]};
export default async function Page({searchParams}:{searchParams:Promise<Search>}){
 const user=await requireAdminPageUser("/admin/partners/events");const raw=await searchParams;
 const status=typeof raw.status==="string"?raw.status:"active";const operation=typeof raw.operation==="string"?raw.operation:"all";const eventType=typeof raw.eventType==="string"?raw.eventType:"all";const region=typeof raw.region==="string"?raw.region:"all";const dateFrom=typeof raw.dateFrom==="string"?raw.dateFrom:"";const dateTo=typeof raw.dateTo==="string"?raw.dateTo:"";const attention=typeof raw.attention==="string"?raw.attention:"all";const q=typeof raw.q==="string"?raw.q:"";
 const items=await listPartnerEventsAdmin({status,operation,eventType,region,dateFrom,dateTo,attention,q});
 return <AdminShell user={user} eyebrow="Partner platforma" title="Podujatia" description="Moderované CREATE a UPDATE návrhy. Partner nikdy priamo nepublikuje ani nemení canonical event.">
  <section className="admin-form-card"><form className="admin-commercial-filters">
   <label>Stav<select name="status" defaultValue={status}><option value="active">Aktívne</option><option value="all">Všetky</option><option value="SUBMITTED">SUBMITTED</option><option value="PENDING_REVIEW">PENDING_REVIEW</option><option value="QUARANTINED">QUARANTINED</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option><option value="WITHDRAWN">WITHDRAWN</option></select></label>
   <label>Operácia<select name="operation" defaultValue={operation}><option value="all">Všetky</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option></select></label>
   <label>Typ podujatia<select name="eventType" defaultValue={eventType}><option value="all">Všetky</option>{eventTypes.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Kraj<select name="region" defaultValue={region}><option value="all">Všetky</option>{slovakRegions.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Od dátumu<input type="date" name="dateFrom" defaultValue={dateFrom}/></label><label>Do dátumu<input type="date" name="dateTo" defaultValue={dateTo}/></label>
   <label>Attention<select name="attention" defaultValue={attention}><option value="all">Všetky</option><option value="attention">Vyžaduje pozornosť</option><option value="normal">Bez zvýšeného rizika</option></select></label>
   <label>Partner / podujatie<input name="q" defaultValue={q}/></label><button>Filtrovať</button>
  </form><div className="admin-commercial-list">
   {items.length?items.map(item=><article key={item.id} className={item.riskFlags.length?"admin-partner-conflict-row":undefined}>
    <div><strong>{String(item.proposedPatch.title??item.currentTitle??"Podujatie")}</strong><small>{item.email} · {item.operation}</small></div>
    <span>{item.status}</span><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
    <p>{item.eventType??"—"} · {item.startDate??"—"} · {item.region??"—"} · {item.changedFieldCount} polí{item.duplicateConfidence!=="NONE"?` · duplicate ${item.duplicateConfidence}`:""}{item.needsAttention?" · ⚠ Attention":""}{item.riskFlags.length?` · ${item.riskFlags.join(", ")}`:""}</p>
    <Link href={`/admin/partners/events/${item.id}`}>Detail →</Link>
   </article>):<p>Žiadne Partner event návrhy pre zvolený filter.</p>}
  </div></section>
 </AdminShell>;
}
