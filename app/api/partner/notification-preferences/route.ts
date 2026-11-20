import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { getPartnerNotificationPreferences,setPartnerNotificationPreferences,PartnerChatError } from "@/lib/partner-chat";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    return Response.json(await getPartnerNotificationPreferences({accountId:identity.accountId}),{headers});
  }catch{return Response.json({error:"Nastavenia sa nepodarilo načítať."},{status:503,headers});}
}
export async function PATCH(request:Request){
  try{
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const value:unknown=await request.json();
    if(!value||typeof value!=="object"||Array.isArray(value))
      throw new PartnerChatError("Neplatná požiadavka.");
    const data=value as Record<string,unknown>;
    if(Object.keys(data).some(key=>!["emailEnabled","inAppEnabled"].includes(key)))
      throw new PartnerChatError("Neznáme nastavenie.");
    return Response.json(await setPartnerNotificationPreferences({
      accountId:identity.accountId,emailEnabled:data.emailEnabled,inAppEnabled:data.inAppEnabled,
    }),{headers});
  }catch(error){
    const status=error instanceof PartnerChatError||error instanceof PartnerSecurityError?error.status:503;
    return Response.json({error:error instanceof Error?error.message:"Uloženie zlyhalo."},{status,headers});
  }
}
