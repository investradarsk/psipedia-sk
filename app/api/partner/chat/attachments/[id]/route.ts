import { requirePartnerAccount } from "@/lib/partner-auth";
import { getPartnerChatAttachment } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const {id}=await params;
    return await getPartnerChatAttachment({id,accountId:identity.accountId});
  }catch{return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});}
}
