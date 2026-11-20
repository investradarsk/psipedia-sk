import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { createPartnerCanonicalDraft, PartnerCanonicalWorkflowError } from "@/lib/partner-canonical-workflow";

export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerCanonicalWorkflowError("Doplňte kontaktné údaje účtu.",403);
    const body:unknown=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body))
      throw new PartnerCanonicalWorkflowError("Neplatné údaje konceptu.");
    const input=body as Record<string,unknown>;
    if(Object.keys(input).some(key=>!["resourceType","data"].includes(key)))
      throw new PartnerCanonicalWorkflowError("Neznáme pole požiadavky.");
    const draft=await createPartnerCanonicalDraft({
      accountId:identity.accountId,resourceType:input.resourceType,data:input.data,
    });
    return Response.json({success:true,draft},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerCanonicalWorkflowError||error instanceof PartnerSecurityError
      ?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    if(status>=500)console.error("Partner canonical draft create failed",error);
    return Response.json({error:status>=500?"Koncept sa momentálne nedá bezpečne uložiť.":error instanceof Error?error.message:"Požiadavka zlyhala."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
