import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPartnerEventsAdmin } from "@/lib/partner-events-admin";
import "../partners.css";
export const dynamic="force-dynamic";
type Search={status?:string|string[];operation?:string|string[];q?:string|string[]};
export default async function Page({searchParams}:{searchParams:Promise<Search>}){
 const user=await requireAdminPageUser("/admin/partners/events");const raw=await searchParams;
 const status=typeof raw.status==="string"?raw.status:"active";const operation=typeof raw.operation==="string"?raw.operation:"all";const q=typeof raw.q==="string"?raw.q:"";
 const items=await listPartnerEventsAdmin({status,operation,q});
 return <AdminShell user={user} eyebrow="Partner platforma" title="Podujatia" description="Moderované CREATE a UPDATE návrhy. Partner nikdy priamo nepublikuje ani nemení canonical event.">
  <section className="admin-form-card"><form className="admin-commercial-filters">
   <label>Stav<select name="status" defaultValue={status}><option value="active">Aktívne</option><option value="all">Všetky</option><option value="SUBMITTED">SUBMITTED</option><option value="PENDING_REVIEW">PENDING_REVIEW</option><option value="QUARANTINED">QUARANTINED</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option><option value="WITHDRAWN">WITHDRAWN</option></select></label>
   <label>Operácia<select name="operation" defaultValue={operation}><option value="all">Všetky</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option></select></label>
   <label>Partner / podujatie<input name="q" defaultValue={q}/></label><button>Filtrovať</button>
  </form><div className="admin-commercial-list">
   {items.length?items.map(item=><article key={item.id} className={item.riskFlags.length?"admin-partner-conflict-row":undefined}>
    <div><strong>{String(item.proposedPatch.title??item.currentTitle??"Podujatie")}</strong><small>{item.email} · {item.operation}</small></div>
    <span>{item.status}</span><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
    <p>{item.changedFieldCount} polí{item.duplicateConfidence!=="NONE"?` · duplicate ${item.duplicateConfidence}`:""}{item.riskFlags.length?` · ⚠ ${item.riskFlags.join(", ")}`:""}</p>
    <Link href={`/admin/partners/events/${item.id}`}>Detail →</Link>
   </article>):<p>Žiadne Partner event návrhy pre zvolený filter.</p>}
  </div></section>
 </AdminShell>;
}
