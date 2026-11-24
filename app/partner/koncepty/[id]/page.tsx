import { getPartnerCanonicalFormFields } from "@/lib/partner-canonical-form-fields";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";
import { getPartnerCanonicalDraft, PartnerCanonicalWorkflowError } from "@/lib/partner-canonical-workflow";

export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const identity=await requirePartnerPageIdentity({returnTo:"/partner/koncepty/"+encodeURIComponent(id)});
  let draft;
  try{draft=await getPartnerCanonicalDraft({accountId:identity.accountId,id});}
  catch(error){if(error instanceof PartnerCanonicalWorkflowError&&error.status===404)notFound();throw error;}
  return <PartnerShell title="Upraviť návrh"
    description="Návrh môžete dopĺňať aj počas kontroly. Na stránke sa zobrazí až po schválení.">
    <p><Link href="/partner/ziadosti">← Moje žiadosti</Link></p>
    <PartnerCanonicalDraftForm categories={directoryCategories.map(({slug,label})=>({slug,label}))} definitions={getPartnerCanonicalFormFields()}
      initial={{id:draft.id,resourceType:draft.resourceType,status:draft.status,
        values:draft.values,baseUpdatedAt:String(draft.baseUpdatedAt),returnReason:draft.returnReason,media:draft.media}} />
  </PartnerShell>;
}
