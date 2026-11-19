import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";
import { getPartnerCanonicalDraft, PartnerCanonicalWorkflowError } from "@/lib/partner-canonical-workflow";

export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
  const identity=await requirePartnerPageIdentity();
  const {id}=await params;
  let draft;
  try{draft=await getPartnerCanonicalDraft({accountId:identity.accountId,id});}
  catch(error){if(error instanceof PartnerCanonicalWorkflowError&&error.status===404)notFound();throw error;}
  return <PartnerShell title="Upraviť partnerský koncept"
    description="Zmeny môžete uložiť aj počas čakania na prvé schválenie. Publikovanie zostáva v rukách administrátora.">
    <p><Link href="/partner/ziadosti">← Moje žiadosti</Link></p>
    <PartnerCanonicalDraftForm categories={directoryCategories.map(({slug,label})=>({slug,label}))}
      initial={{id:draft.id,resourceType:draft.resourceType,status:draft.status,
        values:draft.values,baseUpdatedAt:String(draft.baseUpdatedAt),returnReason:draft.returnReason}} />
  </PartnerShell>;
}
