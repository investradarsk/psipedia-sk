import { retryTransientRead } from "@/lib/public-read-retry";
import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerActivity } from "@/lib/partner-inbox";
import { getPartnerNotificationPreferences } from "@/lib/partner-chat";

export const dynamic="force-dynamic";
export default async function Page(){
  const identity=await requirePartnerPageIdentity();
  const [activity,preferences]=await Promise.all([
    retryTransientRead(() => listPartnerActivity({accountId:identity.accountId})),
    retryTransientRead(() => getPartnerNotificationPreferences({accountId:identity.accountId})),
  ]);
  return <PartnerShell title="Upozornenia" description="Správy a dôležité rozhodnutia týkajúce sa vášho Partner účtu.">
    {!preferences.inAppEnabled&&<p role="status">Interné upozornenia máte vypnuté.
      História rozhodnutí a správy zostávajú dostupné. <Link href="/partner/nastavenia">Zmeniť nastavenie</Link>
    </p>}
    <section className="partner-dashboard-section" aria-label="Nedávna aktivita">
      {activity.length?(
        <div className="partner-request-list">
          {activity.map(item=><article key={item.id}>
            <div className="partner-request-title">
              <div><span>{item.kind==="MESSAGE"?"Súkromná správa":"Partnerská žiadosť"}</span><h3>{item.title}</h3></div>
              <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("sk-SK")}</time>
            </div>
            <Link href={item.href}>Otvoriť</Link>
          </article>)}
        </div>
      ):<p>Žiadna nedávna aktivita.</p>}
    </section>
  </PartnerShell>;
}
