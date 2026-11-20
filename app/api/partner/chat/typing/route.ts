import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { getPartnerTyping,setPartnerTyping } from "@/lib/partner-chat-presence";
import { PartnerChatError } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function fail(error:unknown){
  const status=error instanceof PartnerChatError||error instanceof PartnerSecurityError?error.status:503;
  return Response.json({error:status>=500?"Chat nie je dostupný.":"Neplatná požiadavka."},{status,headers});
}
export async function GET(request:Request){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    return Response.json(await getPartnerTyping({accountId:identity.accountId,viewer:"PARTNER"}),{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)return Response.json({error:"Dokončite nastavenie účtu."},{status:403,headers});
    const data=await request.json() as {typing?:unknown};
    if(typeof data.typing!=="boolean")return Response.json({error:"Neplatná požiadavka."},{status:400,headers});
    return Response.json(await setPartnerTyping({accountId:identity.accountId,viewer:"PARTNER",typing:data.typing}),{headers});
  }catch(error){return fail(error);}
}
