import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { decidePartnerLifecycleAdmin,PartnerLifecycleError } from "@/lib/partner-lifecycle";
import { ModerationStateConflictError } from "@/lib/moderation-transition";

export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requirePartnerAdminMutation(request);
  if(auth.response)return auth.response;
  try{
    const {id}=await params,raw:unknown=await request.json();
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new PartnerLifecycleError("Neplatné rozhodnutie.");
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).some(key=>!["decision","note"].includes(key))||
      !["APPROVE","REJECT"].includes(String(body.decision)))
      throw new PartnerLifecycleError("Vyberte schválenie alebo zamietnutie.");
    const result=await decidePartnerLifecycleAdmin({
      id,adminEmail:auth.user.email,decision:body.decision as "APPROVE"|"REJECT",note:body.note,
      publicOrigin:new URL(request.url).origin,
    });
    return Response.json({success:true,result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerLifecycleError?error.status:
      error instanceof ModerationStateConflictError?409:
      error instanceof Error&&/PARTNER_LIFECYCLE_CAS_CONFLICT|UNIQUE constraint failed/.test(error.message)?409:503;
    if(status>=500)console.error("Partner lifecycle Admin decision failed",error);
    return Response.json({error:status>=500?"Rozhodnutie sa nepodarilo bezpečne uložiť.":error instanceof Error?error.message:"Rozhodnutie zlyhalo."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
