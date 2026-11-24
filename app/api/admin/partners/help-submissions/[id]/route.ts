import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import {
  createPartnerHelpDraftAdmin, linkPartnerHelpCreateAdmin, rejectPartnerHelpCreateAdmin,
  PartnerHelpReviewError,
} from "@/lib/partner-help-create-admin";
import { PartnerHelpCreateError } from "@/lib/partner-help-create";
import { PartnerCanonicalWorkflowError } from "@/lib/partner-canonical-workflow";
import { PartnerOwnershipApprovalGuardError } from "@/lib/partner-ownership-approval";
import { ModerationStateConflictError } from "@/lib/moderation-transition";

export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requirePartnerAdminMutation(request);
  if(auth.response)return auth.response;
  try{
    const {id}=await params;
    const raw:unknown=await request.json();
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      throw new PartnerHelpReviewError("Neplatná požiadavka.");
    const data=raw as Record<string,unknown>;
    const common={id,adminEmail:auth.user.email,requestId:request.headers.get("cf-ray")};
    let result;
    if(data.action==="CREATE_DRAFT"){
      if(Object.keys(data).some(k=>!["action","editedPayload","expectedCanonicalUpdatedAt"].includes(k)))throw new PartnerHelpReviewError("Nepovolené pole.");
      result=await createPartnerHelpDraftAdmin({...common,editedPayload:data.editedPayload,
        expectedCanonicalUpdatedAt:typeof data.expectedCanonicalUpdatedAt==="string"?data.expectedCanonicalUpdatedAt:undefined});
    }else if(data.action==="LINK_EXISTING"){
      if(Object.keys(data).some(k=>!["action","canonicalId"].includes(k)))throw new PartnerHelpReviewError("Nepovolené pole.");
      result=await linkPartnerHelpCreateAdmin({...common,canonicalId:Number(data.canonicalId)});
    }else if(data.action==="REJECT"){
      if(Object.keys(data).some(k=>!["action","reasonCode"].includes(k)))throw new PartnerHelpReviewError("Nepovolené pole.");
      result=await rejectPartnerHelpCreateAdmin({...common,reasonCode:data.reasonCode});
    }else throw new PartnerHelpReviewError("Neplatná moderátorská akcia.");
    return Response.json({success:true,submission:result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerHelpReviewError||error instanceof PartnerHelpCreateError||error instanceof PartnerCanonicalWorkflowError||
      error instanceof PartnerOwnershipApprovalGuardError?error.status
      :error instanceof ModerationStateConflictError?409
      :error instanceof Error&&/UNIQUE constraint failed/.test(error.message)?409:503;
    if(status>=500)console.error("Partner Help approval failed",error);
    return Response.json({error:status>=500?"Rozhodnutie sa nepodarilo bezpečne uložiť.":error instanceof Error?error.message:"Rozhodnutie zlyhalo."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
