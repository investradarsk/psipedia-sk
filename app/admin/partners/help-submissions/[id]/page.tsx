import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerHelpReviewActions } from "@/components/admin-partner-help-review-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerHelpCreateAdmin, PartnerHelpReviewError } from "@/lib/partner-help-create-admin";
import "../../partners.css";

export const dynamic="force-dynamic";
const types={ADOPTION_DOG:"Adopcia",LOST_FOUND_DOG:"Stratený / nájdený pes",HELP_CASE:"Ostatná pomoc psom"};
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const user=await requireAdminPageUser(`/admin/partners/help-submissions/${id}`);
  let item;
  try{item=await getPartnerHelpCreateAdmin(id);}catch(error){
    if(error instanceof PartnerHelpReviewError&&error.status===404)notFound();
    throw error;
  }
  return <AdminShell user={user} eyebrow="Partneri / Pomoc psom" title={item.title}
    description={`${types[item.resourceType]} · ${item.status} · ${new Date(item.createdAt).toLocaleString("sk-SK")}`}>
    <div className="admin-partner-detail">
      <section className="admin-form-card">
        <Link href="/admin/partners/help-submissions">← Všetky návrhy</Link>
        <h2>Žiadosť a kontrola</h2>
        <p>Partner: <Link href={`/admin/partners/accounts/${item.accountId}`}>{item.accountId}</Link></p>
        <p>Stav: <strong>{item.status}</strong></p>
        {item.risks.length?<p role="alert"><strong>Možná duplicita:</strong> {item.risks.join(", ")}. Pred vytvorením porovnajte už existujúce záznamy.</p>:null}
        {item.canonicalId?<p>Kanonické ID: <strong>#{item.canonicalId}</strong>. Vytvorený záznam zatiaľ nie je automaticky publikovaný.</p>:null}
        {item.rejectionReasonCode?<p>Dôvod zamietnutia: {item.rejectionReasonCode}</p>:null}
      </section>
      <section className="admin-form-card">
        <h2>Pôvodne odoslané údaje</h2>
        <dl>{Object.entries(item.payload).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null?"—":String(value)}</dd></div>)}</dl>
      </section>
    </div>
    {item.active?<AdminPartnerHelpReviewActions id={item.id} resourceType={item.resourceType} payload={item.payload}/>:
      <section className="admin-form-card"><h2>Uzavretá žiadosť</h2><p>Návrh už nie je možné znovu schváliť. Všetky rozhodnutia ostávajú v histórii.</p></section>}
    <section className="admin-form-card">
      <h2>História moderácie</h2>
      <div className="admin-audit-list">{item.history.map((entry,index)=>{
        const data=entry as Record<string,unknown>;
        return <article key={String(data.id??index)}><strong>{String(data.action??"")}</strong>
          <span>{String(data.fromStatus??"—")} → {String(data.toStatus??"—")}</span>
          <small>{new Date(String(data.createdAt??item.createdAt)).toLocaleString("sk-SK")}</small></article>;
      })}</div>
    </section>
  </AdminShell>;
}
