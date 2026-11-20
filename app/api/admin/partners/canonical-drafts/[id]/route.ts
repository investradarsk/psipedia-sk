import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { decidePartnerCanonicalDraftAdmin, PartnerCanonicalWorkflowError } from "@/lib/partner-canonical-workflow";
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
      throw new PartnerCanonicalWorkflowError("Neplatné rozhodnutie.");
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).some(key=>!["action","note","expectedCanonicalUpdatedAt"].includes(key)))
      throw new PartnerCanonicalWorkflowError("Nepovolené pole rozhodnutia.");
    if(!["APPROVE","REJECT","RETURN"].includes(String(body.action)))
      throw new PartnerCanonicalWorkflowError("Vyberte platné rozhodnutie.");
    const outcome=await decidePartnerCanonicalDraftAdmin({
      id,adminEmail:auth.user.email,action:body.action as "APPROVE"|"REJECT"|"RETURN",
      note:body.note as string|undefined,
      expectedCanonicalUpdatedAt:typeof body.expectedCanonicalUpdatedAt==="string"?body.expectedCanonicalUpdatedAt:undefined,
    });
    return Response.json({success:true,decision:outcome},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerCanonicalWorkflowError||error instanceof PartnerOwnershipApprovalGuardError
      ?error.status:error instanceof ModerationStateConflictError?409
      :error instanceof Error&&/PARTNER_CANONICAL_DRAFT_REVISION_CONFLICT|UNIQUE constraint failed/.test(error.message)?409:503;
    if(status>=500)console.error("Partner canonical moderation failed",error);
    return Response.json({error:status>=500?"Rozhodnutie sa nepodarilo bezpečne uložiť.":error instanceof Error?error.message:"Rozhodnutie zlyhalo."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
