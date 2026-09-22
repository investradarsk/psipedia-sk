import {requirePartnerAccount} from "@/lib/partner-auth";
import {createPartnerCommercialInterest,PartnerCommercialError} from "@/lib/partner-commercial";
import {assertPartnerJsonMutation,PartnerSecurityError} from "@/lib/partner-security";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const body=await request.json() as Record<string,unknown>;
    const result=await createPartnerCommercialInterest({accountId:identity.accountId,interestType:body.interestType,resourceId:body.resourceId,message:body.message});
    return Response.json({success:true,...result},{status:result.deduplicated?200:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerCommercialError||error instanceof PartnerSecurityError?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    return Response.json({error:status>=500?"Odoslanie záujmu momentálne nie je dostupné.":error instanceof Error?error.message:"Požiadavka zlyhala."},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}
