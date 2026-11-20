import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import {
  getPartnerCanonicalDraft,savePartnerCanonicalDraft,submitPartnerCanonicalDraft,PartnerCanonicalWorkflowError,
} from "@/lib/partner-canonical-workflow";

export const dynamic="force-dynamic";
type Params={params:Promise<{id:string}>};
function failure(error:unknown){
  const status=error instanceof PartnerCanonicalWorkflowError||error instanceof PartnerSecurityError
    ?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
  if(status>=500)console.error("Partner canonical draft failed",error);
  return Response.json({error:status>=500?"Údaje konceptu sa momentálne nepodarilo načítať alebo uložiť.":error instanceof Error?error.message:"Požiadavka zlyhala.",
    ...(error instanceof PartnerCanonicalWorkflowError?{code:error.code}:{})},
    {status,headers:{"Cache-Control":"private, no-store"}});
}
export async function GET(request:Request,{params}:Params){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerCanonicalWorkflowError("Doplňte kontaktné údaje účtu.",403);
    const {id}=await params;
    const draft=await getPartnerCanonicalDraft({accountId:identity.accountId,id});
    return Response.json({success:true,draft},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error)}
}
export async function PATCH(request:Request,{params}:Params){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerCanonicalWorkflowError("Doplňte kontaktné údaje účtu.",403);
    const {id}=await params;
    const body:unknown=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body))
      throw new PartnerCanonicalWorkflowError("Neplatná požiadavka.");
    const data=body as Record<string,unknown>;
    let draft;
    if(data.action==="SAVE"){
      if(Object.keys(data).some(key=>!["action","data","baseUpdatedAt","media"].includes(key))||typeof data.baseUpdatedAt!=="string")
        throw new PartnerCanonicalWorkflowError("Neplatná aktualizácia konceptu.");
      draft=await savePartnerCanonicalDraft({accountId:identity.accountId,id,data:data.data,baseUpdatedAt:data.baseUpdatedAt,media:data.media});
    }else if(data.action==="SUBMIT"){
      if(Object.keys(data).some(key=>!["action","confirmDuplicate"].includes(key))||
        (data.confirmDuplicate!==undefined&&typeof data.confirmDuplicate!=="boolean"))
        throw new PartnerCanonicalWorkflowError("Neplatné odoslanie konceptu.");
      draft=await submitPartnerCanonicalDraft({accountId:identity.accountId,id,confirmDuplicate:data.confirmDuplicate===true});
    }else throw new PartnerCanonicalWorkflowError("Neplatná akcia.");
    return Response.json({success:true,draft},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error)}
}
