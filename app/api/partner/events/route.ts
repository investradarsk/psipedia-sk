import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerEventError, submitPartnerEventCreate } from "@/lib/partner-events";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const body=await request.json() as Record<string,unknown>;
    const submission=await submitPartnerEventCreate({accountId:identity.accountId,event:body.event,confirmDuplicate:body.confirmDuplicate===true});
    return Response.json({success:true,submission},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerEventError||error instanceof PartnerSecurityError?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    return Response.json({error:status>=500?"Podujatie momentálne nie je možné odoslať.":error instanceof Error?error.message:"Požiadavka zlyhala.",code:error instanceof PartnerEventError?error.code:undefined,details:error instanceof PartnerEventError?error.details:undefined},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}