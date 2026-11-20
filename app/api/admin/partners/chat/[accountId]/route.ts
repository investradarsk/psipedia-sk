import { getAdminApiUser } from "@/lib/admin-auth";
import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { listPartnerChat,sendPartnerChat,PartnerChatError } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function fail(error:unknown){
  const status=error instanceof PartnerChatError?error.status:503;
  if(status>=500)console.error("Admin partner chat failed",error);
  return Response.json({error:status>=500?"Chat momentálne nie je dostupný.":error instanceof Error?error.message:"Chat nie je dostupný."},{status,headers});
}
export async function GET(request:Request,{params}:{params:Promise<{accountId:string}>}){
  const user=await getAdminApiUser();
  if(!user)return Response.json({error:"Nemáte oprávnenie."},{status:401,headers});
  try{
    const {accountId}=await params;
    return Response.json(await listPartnerChat({
      accountId,before:new URL(request.url).searchParams.get("before")??undefined,
    }),{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){
  const auth=await requirePartnerAdminMutation(request);
  if(auth.response)return auth.response;
  try{
    const {accountId}=await params;
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
      throw new PartnerChatError("Očakáva sa správa s prílohami.",415);
    if(Number(request.headers.get("content-length")||"0")>13*1024*1024)
      throw new PartnerChatError("Požiadavka je príliš veľká.",413);
    const form=await request.formData(),raw=form.get("body");
    if(typeof raw!=="string"||form.getAll("body").length!==1)throw new PartnerChatError("Napíšte platnú správu.");
    const result=await sendPartnerChat({accountId,senderRole:"ADMIN",
      senderRef:"admin:"+auth.user.email.trim().toLowerCase(),body:raw,files:form.getAll("files"),
    });
    return Response.json({success:true,message:result},{status:201,headers});
  }catch(error){return fail(error);}
}
