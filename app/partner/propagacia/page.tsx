import {PartnerCommercialPanel} from "@/components/partner-commercial-panel";
import {PartnerShell} from "@/components/partner-shell";
import {listPartnerCommercialInterests} from "@/lib/partner-commercial";
import {listPartnerCommercialAgreements} from "@/lib/partner-commercial-agreements";
import {requirePartnerPageIdentity} from "@/lib/partner-page-auth";
import {listPartnerResources} from "@/lib/partner-platform";
export const dynamic="force-dynamic";
const labels:Record<string,string>={PREMIUM_PROFILE:"Premium profil",PROMOTED_PROFILE:"Propagovaný profil",AD_CAMPAIGN:"Reklamná kampaň",OTHER:"Iný záujem"};
function euro(cents:number){return new Intl.NumberFormat("sk-SK",{style:"currency",currency:"EUR"}).format(cents/100);}
const paymentLabels:Record<string,string>={BANK_TRANSFER:"Bankový prevod",BY_AGREEMENT:"Podľa dohody"};
export default async function Page(){
  const identity=await requirePartnerPageIdentity();
  const[resources,history,agreements]=await Promise.all([listPartnerResources(identity.accountId),listPartnerCommercialInterests(identity.accountId),listPartnerCommercialAgreements(identity.accountId)]);
  const eligible=resources.filter(r=>r.role==="OWNER"||r.role==="MANAGER").map(r=>({resourceId:r.resourceId,name:r.name,role:r.role}));
  return <PartnerShell title="Propagácia" description="Premium, sponzorované zvýraznenie a reklamná spolupráca sa riešia manuálnou ponukou. Bez online platobnej brány.">
    <PartnerCommercialPanel resources={eligible}/>
    <section className="partner-commercial-history"><h2>Moje ponuky / dohody</h2>{agreements.length?<div>{agreements.map(item=><article key={item.id}>
      <div><strong>{labels[item.agreementType]??item.agreementType}</strong><span>{item.resourceName??"Komerčná spolupráca"}</span></div>
      <span className="partner-commercial-status">{item.status}</span><strong>{euro(item.priceCents)}</strong>
      <p>{new Date(item.startAt).toLocaleDateString("sk-SK")} – {new Date(item.endAt).toLocaleDateString("sk-SK")} · {paymentLabels[item.paymentMethod]??item.paymentMethod} · {item.paymentStatus}</p>
      {item.partnerNote&&<p>{item.partnerNote}</p>}
      <p><strong>Platobné pokyny:</strong> {item.paymentInstruction??"Platobné údaje vám zašleme po dohode."}</p>
    </article>)}</div>:<p>Zatiaľ nemáte žiadnu obchodnú ponuku alebo dohodu.</p>}</section>
    <section className="partner-commercial-history"><h2>Odoslané záujmy</h2>{history.length?<div>{history.map(item=><article key={item.id}><div><strong>{labels[item.interestType]??item.interestType}</strong><span>{item.resourceName??"Bez konkrétneho profilu"}</span></div><span className="partner-commercial-status">{item.status}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("sk-SK")}</time>{item.message&&<p>{item.message}</p>}</article>)}</div>:<p>Zatiaľ ste neposlali žiadny nezáväzný záujem.</p>}</section>
  </PartnerShell>;
}
