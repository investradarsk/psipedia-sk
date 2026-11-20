import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { markPartnerChatRead,PartnerChatError } from "@/lib/partner-chat";
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    await markPartnerChatRead({accountId:identity.accountId,viewer:"PARTNER"});
    return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerSecurityError||error instanceof PartnerChatError?error.status:503;
    return Response.json({error:"Označenie správ sa nepodarilo."},{status});
  }
}
