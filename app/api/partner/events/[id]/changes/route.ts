import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerEventError, submitPartnerEventUpdate } from "@/lib/partner-events";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const {id}=await params;if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new PartnerEventError("Neplatný Partner resource.");
    const body=await request.json() as Record<string,unknown>;
    const submission=await submitPartnerEventUpdate({accountId:identity.accountId,resourceId:id,baseRevision:body.baseRevision,patch:body.patch,mediaAssetId:body.mediaAssetId});
    return Response.json({success:true,submission},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerEventError||error instanceof PartnerSecurityError?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    return Response.json({error:status>=500?"Návrh úprav momentálne nie je možné odoslať.":error instanceof Error?error.message:"Požiadavka zlyhala."},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}