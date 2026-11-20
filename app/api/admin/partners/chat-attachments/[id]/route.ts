import { getAdminApiUser } from "@/lib/admin-auth";
import { getPartnerChatAttachment } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAdminApiUser();
  if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  const {id}=await params;
  try{
    // Admin can read only a persisted private attachment that belongs to
    // an existing Partner account. Account is fetched by the exact asset ID.
    const { getPartnerDatabase } = await import("@/lib/partner-auth-store");
    const db=getPartnerDatabase();
    const row=await db.prepare("SELECT m.partner_account_id accountId FROM partner_chat_attachments a "+
      "JOIN partner_chat_messages m ON m.id=a.message_id WHERE a.id=? LIMIT 1")
      .bind(id).first<{accountId:string}>();
    if(!row)return new Response("Not found",{status:404});
    return await getPartnerChatAttachment({id,accountId:row.accountId,database:db});
  }catch{return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});}
}
