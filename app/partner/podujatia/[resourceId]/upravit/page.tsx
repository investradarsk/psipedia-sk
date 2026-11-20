import { PartnerLifecycleRequest } from "@/components/partner-lifecycle-request";
import Link from "next/link";
import { PartnerEventForm } from "@/components/partner-event-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerEventEditor } from "@/lib/partner-events";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{resourceId:string}>}){
  const identity=await requirePartnerPageIdentity();const {resourceId}=await params;
  const editor=await getPartnerEventEditor(identity.accountId,resourceId);
  return <PartnerShell title={`Upraviť: ${editor.resource.title}`} description="Upravte iba potrebné verejné polia. Zápis kontroluje oprávnenie správcu a novšiu verziu podujatia.">
    <div className="partner-new-profile-intro"><div><span className="eyebrow">Schválený správca</span><h2>{editor.resource.status==="published"?"Publikované podujatie":"Koncept"}</h2><p>Webová adresa a stav zverejnenia sa Partner úpravou nemenia. Ak sa záznam medzitým zmení, odoslanie sa bezpečne zastaví.</p></div><Link href="/partner/podujatia" className="partner-inline-link">← Moje podujatia</Link></div>
    <PartnerLifecycleRequest resourceId={resourceId} />
    <PartnerEventForm mode="edit" resourceId={resourceId} baseRevision={editor.baseRevision} initial={editor.values} currentImageUrl={editor.resource.imageUrl}/>
  </PartnerShell>;
}