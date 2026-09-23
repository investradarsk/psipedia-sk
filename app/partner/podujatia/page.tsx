import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerManagedEvents } from "@/lib/partner-events";
export const dynamic="force-dynamic";
function dateLabel(value:string){return new Intl.DateTimeFormat("sk-SK",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Bratislava"}).format(new Date(value+"T12:00:00Z"));}
export default async function Page(){
 const identity=await requirePartnerPageIdentity();const items=await listPartnerManagedEvents(identity.accountId);
 return <PartnerShell title="Moje podujatia" description="Podujatia priradené k vášmu Partner účtu. Úpravy vždy prechádzajú moderáciou.">
  <div className="partner-new-profile-cta"><div><span className="eyebrow">Partner Events</span><h2>Chýba vaše podujatie?</h2><p>Navrhnite nové podujatie. Po schválení vznikne ako koncept a redakcia rozhodne o publikovaní.</p></div><Link href="/partner/podujatia/nove" className="button button--dark">Pridať podujatie</Link></div>
  {items.length?<div className="partner-resource-grid">{items.map(item=><article className="partner-resource-card" key={item.resourceId}>
    <span>{item.eventType}</span><h2>{item.title}</h2>
    <p><strong>{item.status==="published"?"Publikované":"Koncept"}</strong>{item.cancelled?" · Zrušené":""}{item.pendingChange?" · Zmena čaká na kontrolu":""}</p>
    <p>{dateLabel(item.startDate)}{item.startTime?` · ${item.startTime}`:""} · {item.venue||item.city}</p>
    <p>Rola: <strong>{item.role}</strong></p>
    <div className="partner-request-links">{item.publicHref?<Link href={item.publicHref} target="_blank">Verejné podujatie ↗</Link>:null}<Link className="button button--dark" href={`/partner/podujatia/${encodeURIComponent(item.resourceId)}/upravit`}>Upraviť</Link></div>
  </article>)}</div>:<section className="partner-empty"><h2>Zatiaľ nemáte priradené podujatie</h2><p>Môžete navrhnúť nové podujatie. Po admin schválení sa zobrazí medzi vašimi Partner zdrojmi.</p></section>}
 </PartnerShell>;
}