import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { createPartnerLifecycleRequest, PartnerLifecycleError } from "@/lib/partner-lifecycle";

export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerLifecycleError("Dokončite kontaktné údaje účtu.",403);
    const raw:unknown=await request.json();
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new PartnerLifecycleError("Neplatná požiadavka.");
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).some(key=>!["action","resourceId","reason"].includes(key)))
      throw new PartnerLifecycleError("Nepovolené pole žiadosti.");
    const result=await createPartnerLifecycleRequest({accountId:identity.accountId,
      action:input.action,resourceId:input.resourceId,reason:input.reason});
    return Response.json({success:true,request:result},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerLifecycleError||error instanceof PartnerSecurityError
      ?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    if(status>=500)console.error("Partner lifecycle request failed",error);
    return Response.json({error:status>=500?"Žiadosť sa momentálne nepodarilo uložiť.":error instanceof Error?error.message:"Žiadosť zlyhala."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
