import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { markPartnerChatRead,PartnerChatError } from "@/lib/partner-chat";
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){
  const auth=await requirePartnerAdminMutation(request);
  if(auth.response)return auth.response;
  try{
    const {accountId}=await params;
    await markPartnerChatRead({accountId,viewer:"ADMIN"});
    return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return Response.json({error:"Označenie správ sa nepodarilo."},
      {status:error instanceof PartnerChatError?error.status:503});
  }
}
