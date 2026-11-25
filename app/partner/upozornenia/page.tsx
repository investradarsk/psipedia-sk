import { settleOptionalRead } from "@/lib/optional-read-recovery";
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
    settleOptionalRead("partner_activity", retryTransientRead(() => listPartnerActivity({accountId:identity.accountId}), { stage: "partner_activity" }), null),
    settleOptionalRead("partner_notification_preferences", retryTransientRead(() => getPartnerNotificationPreferences({accountId:identity.accountId}), { stage: "partner_notification_preferences" }), null),
  ]);
  return <PartnerShell title="Upozornenia" description="Správy a dôležité rozhodnutia týkajúce sa vášho Partner účtu.">
    {preferences === null && <p role="status">Nastavenia upozornení sú dočasne nedostupné.</p>}
    {preferences && !preferences.inAppEnabled&&<p role="status">Interné upozornenia máte vypnuté.
      História rozhodnutí a správy zostávajú dostupné. <Link href="/partner/nastavenia">Zmeniť nastavenie</Link>
    </p>}
    <section className="partner-dashboard-section" aria-label="Nedávna aktivita">
      {activity === null ? <p role="status">Aktivita je dočasne nedostupná. Skúste to znova.</p> : activity.length?(
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
