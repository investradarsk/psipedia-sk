import Link from "next/link";
import { PartnerEventForm } from "@/components/partner-event-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
export const dynamic="force-dynamic";
export default async function Page(){
  await requirePartnerPageIdentity();
  return <PartnerShell title="Pridať podujatie" description="Navrhnite nové podujatie na moderátorskú kontrolu. Partner ho nikdy nepublikuje priamo.">
    <div className="partner-new-profile-intro"><div><span className="eyebrow">Moderované podujatia</span><h2>Nové podujatie</h2><p>Po schválení administrátorom sa podujatie uloží ako koncept. Priložený obrázok prejde rovnakou moderátorskou kontrolou; SEO údaje a zverejnenie zostávajú redakčným krokom.</p></div><Link href="/partner/podujatia" className="partner-inline-link">← Moje podujatia</Link></div>
    <PartnerEventForm mode="create"/>
  </PartnerShell>;
}