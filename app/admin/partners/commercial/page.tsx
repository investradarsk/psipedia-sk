import Link from "next/link";
import {AdminShell} from "@/components/admin-shell";
import {requireAdminPageUser} from "@/lib/admin-auth";
import {listPartnerCommercialInterestsAdmin} from "@/lib/partner-commercial-admin";
import {getPartnerCommercialAdminSummary,listPartnerCommercialAgreementsAdmin} from "@/lib/partner-commercial-agreements";
import {partnerCommercialInterestTypes,partnerCommercialStatuses} from "@/lib/partner-commercial";
import "../partners.css";
export const dynamic="force-dynamic";
type Search={status?:string|string[];type?:string|string[];q?:string|string[]};
function euro(cents:number){return new Intl.NumberFormat("sk-SK",{style:"currency",currency:"EUR"}).format(cents/100);}
export default async function Page({searchParams}:{searchParams:Promise<Search>}){
  const user=await requireAdminPageUser("/admin/partners/commercial"),raw=await searchParams,status=typeof raw.status==="string"?raw.status:"NEW",interestType=typeof raw.type==="string"?raw.type:"all",q=typeof raw.q==="string"?raw.q:"";
  const[items,agreements,commercialSummary]=await Promise.all([listPartnerCommercialInterestsAdmin({status,interestType,q}),listPartnerCommercialAgreementsAdmin(),getPartnerCommercialAdminSummary()]);
  return <AdminShell user={user} eyebrow="Partner commercial" title="Komerčný hub" description="Leady, manuálne dohody, platby a platené aktivácie bez online payment gateway.">
    <section className="admin-form-card"><h2>Prehľad</h2><div className="admin-commercial-list">
      <article><strong>{items.filter(x=>x.status==="NEW").length}</strong><span>nové leady</span></article>
      <article><strong>{commercialSummary.awaitingPayment}</strong><span>čaká na platbu</span></article>
      <article><strong>{commercialSummary.readyToActivate}</strong><span>pripravené na aktiváciu</span></article>
      <article><strong>{commercialSummary.active}</strong><span>aktívne komerčné položky</span></article>
      <article><strong>{commercialSummary.expiringSoon}</strong><span>končí do 14 dní</span></article>
    </div></section>
    <section className="admin-form-card"><h2>Dohody</h2><div className="admin-commercial-list">{agreements.length?agreements.map(a=><article key={a.id}>
      <div><strong>{a.resourceName??a.agreementType}</strong><small>{a.agreementType} · {euro(a.priceCents)}</small></div>
      <span>{a.status}</span><span>{a.paymentStatus}</span><span>{new Date(a.endAt).toLocaleDateString("sk-SK")}</span>
      <Link href={`/admin/partners/commercial/agreements/${a.id}`}>Detail dohody →</Link>
    </article>):<p>Zatiaľ nie sú vytvorené žiadne dohody.</p>}</div></section>
    <section className="admin-form-card"><h2>Commercial leady</h2><form className="admin-commercial-filters">
      <label>Stav<select name="status" defaultValue={status}><option value="all">Všetky</option>{partnerCommercialStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Typ<select name="type" defaultValue={interestType}><option value="all">Všetky</option>{partnerCommercialInterestTypes.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Hľadať<input name="q" defaultValue={q}/></label><button>Filtrovať</button></form>
      <div className="admin-commercial-list">{items.length?items.map(item=><article key={item.id}><div><strong>{item.resourceName??item.email}</strong><small>{item.email} · {item.interestType}</small></div><span>{item.status}</span><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span><p>{item.message??"Bez správy"}</p><Link href={`/admin/partners/commercial/${item.id}`}>Detail leadu →</Link></article>):<p>Žiadne leady pre zvolený filter.</p>}</div>
    </section>
  </AdminShell>;
}
