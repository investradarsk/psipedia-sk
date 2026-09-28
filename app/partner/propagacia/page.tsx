import { PartnerCommercialPanel } from "@/components/partner-commercial-panel";
import { PartnerShell } from "@/components/partner-shell";
import { listPartnerCommercialInterests } from "@/lib/partner-commercial";
import { listPartnerCommercialAgreements } from "@/lib/partner-commercial-agreements";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerResources } from "@/lib/partner-platform";
import {
  partnerCommercialStatusLabel,
  partnerCommercialTypeLabel,
  partnerPaymentMethodLabel,
  partnerPaymentStatusLabel,
  partnerRoleLabel,
} from "@/lib/partner-ui-labels";

export const dynamic="force-dynamic";

function euro(cents:number){
  return new Intl.NumberFormat("sk-SK",{style:"currency",currency:"EUR"}).format(cents/100);
}

type Search={resource?:string|string[]};
function scalar(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}

export default async function Page({searchParams}:{searchParams:Promise<Search>}){
  const identity=await requirePartnerPageIdentity();
  const requestedResource=scalar((await searchParams).resource);
  const [resources,history,agreements]=await Promise.all([
    listPartnerResources(identity.accountId),
    listPartnerCommercialInterests(identity.accountId),
    listPartnerCommercialAgreements(identity.accountId),
  ]);
  const eligible=resources
    .filter(r=>r.role==="OWNER"||r.role==="MANAGER")
    .map(r=>({resourceId:r.resourceId,name:r.name,role:partnerRoleLabel(r.role)}));
  const defaultResourceId=requestedResource&&eligible.some(r=>r.resourceId===requestedResource)?requestedResource:undefined;

  return <PartnerShell title="Propagácia" description="Premium, sponzorované zvýraznenie a reklamná spolupráca sa riešia manuálnou ponukou. Bez online platobnej brány.">
    <PartnerCommercialPanel resources={eligible} defaultResourceId={defaultResourceId}/>

    <section className="partner-foundation-note" aria-label="Rozdiel medzi propagáciou a overením">
      <strong>Overenie správcu je samostatné</strong>
      <p>Premium rozširuje prezentáciu profilu. Sponzorované zvýraznenie je platená propagácia a musí byť viditeľne označené. Overenie iba potvrdzuje oprávnenie spravovať profil — nie je odporúčaním Psipedie ani garanciou kvality.</p>
    </section>

    <section className="partner-commercial-history"><h2>Moje ponuky / dohody</h2>{agreements.length?<div>{agreements.map(item=><article key={item.id}>
      <div><strong>{partnerCommercialTypeLabel(item.agreementType)}</strong><span>{item.resourceName??"Komerčná spolupráca"}</span></div>
      <span className="partner-commercial-status">{partnerCommercialStatusLabel(item.status)}</span><strong>{euro(item.priceCents)}</strong>
      <p>{new Date(item.startAt).toLocaleDateString("sk-SK")} – {new Date(item.endAt).toLocaleDateString("sk-SK")} · {partnerPaymentMethodLabel(item.paymentMethod)} · {partnerPaymentStatusLabel(item.paymentStatus)}</p>
      {item.partnerNote&&<p>{item.partnerNote}</p>}
      <p><strong>Platobné pokyny:</strong> {item.paymentInstruction??"Platobné údaje vám zašleme po dohode."}</p>
    </article>)}</div>:<p>Zatiaľ nemáte žiadnu obchodnú ponuku alebo dohodu.</p>}</section>

    <section className="partner-commercial-history"><h2>Odoslané záujmy</h2>{history.length?<div>{history.map(item=><article key={item.id}>
      <div><strong>{partnerCommercialTypeLabel(item.interestType)}</strong><span>{item.resourceName??"Bez konkrétneho profilu alebo podujatia"}</span></div>
      <span className="partner-commercial-status">{partnerCommercialStatusLabel(item.status)}</span>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("sk-SK")}</time>
      {item.message&&<p>{item.message}</p>}
    </article>)}</div>:<p>Zatiaľ ste neposlali žiadny nezáväzný záujem.</p>}</section>
  </PartnerShell>;
}
