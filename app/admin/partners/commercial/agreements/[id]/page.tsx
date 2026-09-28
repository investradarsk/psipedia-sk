import Link from "next/link";
import {notFound} from "next/navigation";
import {AdminShell} from "@/components/admin-shell";
import {AdminPartnerAgreementActions} from "@/components/admin-partner-agreement-actions";
import {requireAdminPageUser} from "@/lib/admin-auth";
import {getPartnerCommercialAgreementAdmin} from "@/lib/partner-commercial-agreements";
import "../../../partners.css";
export const dynamic="force-dynamic";
function euro(cents:number){return new Intl.NumberFormat("sk-SK",{style:"currency",currency:"EUR"}).format(cents/100);}
export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params,user=await requireAdminPageUser(`/admin/partners/commercial/agreements/${id}`),agreement=await getPartnerCommercialAgreementAdmin(id);
  if(!agreement)notFound();
  return <AdminShell user={user} eyebrow="Partner commercial" title={agreement.resourceName??agreement.agreementType} description={`${agreement.status} · ${agreement.agreementType}`}>
    <div className="admin-partner-detail">
      <section className="admin-form-card"><h2>Dohoda</h2><dl>
        <div><dt>Typ</dt><dd>{agreement.agreementType}</dd></div><div><dt>Cena</dt><dd>{euro(agreement.priceCents)}</dd></div>
        <div><dt>Obdobie</dt><dd>{new Date(agreement.startAt).toLocaleString("sk-SK")} – {new Date(agreement.endAt).toLocaleString("sk-SK")}</dd></div>
        <div><dt>Stav</dt><dd>{agreement.status}</dd></div><div><dt>Platba</dt><dd>{agreement.paymentMethod} · {agreement.paymentStatus}</dd></div>
      </dl>{agreement.interestId&&<Link href={`/admin/partners/commercial/${agreement.interestId}`}>Pôvodný lead →</Link>}</section>
      <section className="admin-form-card"><h2>Partner-visible</h2><p>{agreement.partnerNote??"Bez poznámky."}</p><p><strong>Platobné pokyny:</strong> {agreement.paymentInstruction??"Platobné údaje vám zašleme po dohode."}</p></section>
      <section className="admin-form-card"><h2>Interné</h2><p>{agreement.adminNote??"Bez internej poznámky."}</p>{agreement.campaignId&&<p>Campaign: {agreement.campaignId}</p>}{agreement.promotionId&&<p>Promotion: {agreement.promotionId}</p>}</section>
    </div>
    <AdminPartnerAgreementActions id={agreement.id} type={agreement.agreementType} status={agreement.status} paymentStatus={agreement.paymentStatus} paymentMethod={agreement.paymentMethod} entitlementStatus={agreement.entitlementStatus} campaignId={agreement.campaignId}/>
  </AdminShell>;
}
