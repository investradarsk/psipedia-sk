import { getAdminApiUser } from "@/lib/admin-auth";
import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { getPartnerTyping,setPartnerTyping } from "@/lib/partner-chat-presence";
import { PartnerChatError } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function fail(error:unknown){
  const status=error instanceof PartnerChatError?error.status:503;
  return Response.json({error:status>=500?"Chat nie je dostupný.":"Neplatná požiadavka."},{status,headers});
}
export async function GET(request:Request,{params}:{params:Promise<{accountId:string}>}){
  const admin=await getAdminApiUser();
  if(!admin)return Response.json({error:"Nemáte oprávnenie."},{status:401,headers});
  try{
    const {accountId}=await params;
    return Response.json(await getPartnerTyping({accountId,viewer:"ADMIN"}),{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){
  const auth=await requirePartnerAdminMutation(request);
  if(auth.response)return auth.response;
  try{
    const {accountId}=await params;
    const data=await request.json() as {typing?:unknown};
    if(typeof data.typing!=="boolean")return Response.json({error:"Neplatná požiadavka."},{status:400,headers});
    return Response.json(await setPartnerTyping({accountId,viewer:"ADMIN",typing:data.typing}),{headers});
  }catch(error){return fail(error);}
}
