import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerMutationOrigin, PartnerSecurityError } from "@/lib/partner-security";
import { listPartnerChat,sendPartnerChat,PartnerChatError } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function fail(error:unknown){
  const status=error instanceof PartnerChatError||error instanceof PartnerSecurityError?error.status:503;
  if(status>=500)console.error("Partner chat error",error);
  return Response.json({error:status>=500?"Chat momentálne nie je dostupný.":error instanceof Error?error.message:"Chat nie je dostupný."},{status,headers});
}
export async function GET(request:Request){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    return Response.json(await listPartnerChat({
      accountId:identity.accountId,before:new URL(request.url).searchParams.get("before")??undefined,
    }),{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request){
  try{
    assertPartnerMutationOrigin(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerChatError("Doplňte kontaktné údaje účtu.",403);
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
      throw new PartnerChatError("Očakáva sa správa s prílohami.",415);
    if(Number(request.headers.get("content-length")||"0")>13*1024*1024)
      throw new PartnerChatError("Požiadavka je príliš veľká.",413);
    const form=await request.formData();
    const raw=form.get("body");
    if(typeof raw!=="string"||form.getAll("body").length!==1)
      throw new PartnerChatError("Napíšte platnú správu.");
    const data=await sendPartnerChat({
      accountId:identity.accountId,senderRole:"PARTNER",senderRef:"partner:"+identity.accountId,
      body:raw,files:form.getAll("files"),
    });
    return Response.json({success:true,message:data},{status:201,headers});
  }catch(error){return fail(error);}
}
