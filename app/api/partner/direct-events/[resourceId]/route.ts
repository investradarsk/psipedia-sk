import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerEventError } from "@/lib/partner-events";
import { PartnerAuthorizationError } from "@/lib/partner-platform";
import { PartnerMediaError } from "@/lib/partner-media";
import { PartnerSecurityError, assertPartnerJsonMutation } from "@/lib/partner-security";
import { savePartnerManagedEvent } from "@/lib/partner-direct-event";

export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{resourceId:string}>}){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerEventError("Najprv dokončite registráciu.",403);
    const {resourceId}=await params;
    const data:unknown=await request.json();
    if(!data||typeof data!=="object"||Array.isArray(data))throw new PartnerEventError("Neplatná požiadavka.");
    const body=data as Record<string,unknown>;
    if(Object.keys(body).some(key=>!["baseRevision","patch","mediaAssetId"].includes(key)))
      throw new PartnerEventError("Nepovolené pole v požiadavke.");
    const result=await savePartnerManagedEvent({
      accountId:identity.accountId,resourceId,baseRevision:body.baseRevision,patch:body.patch,
      mediaAssetId:body.mediaAssetId,publicOrigin:new URL(request.url).origin,
    });
    return Response.json({success:true,result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerEventError||error instanceof PartnerAuthorizationError||
      error instanceof PartnerMediaError||error instanceof PartnerSecurityError?error.status
      :typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    if(status>=500)console.error("Partner direct event update failed",error);
    return Response.json({error:status>=500?"Podujatie sa nepodarilo uložiť.":error instanceof Error?error.message:"Zápis zlyhal."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
