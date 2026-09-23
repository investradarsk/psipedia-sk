import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { createPartnerEventAdmin,linkPartnerEventAdmin,approvePartnerEventUpdateAdmin,rejectPartnerEventAdmin } from "@/lib/partner-events-admin";
import { PartnerEventError } from "@/lib/partner-events";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requirePartnerAdminMutation(request);if(auth.response)return auth.response;
 try{
  const {id}=await params;if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new PartnerEventError("Neplatný návrh.");
  const body=await request.json() as Record<string,unknown>;const common={id,adminEmail:auth.user.email,requestId:request.headers.get("cf-ray"),publicOrigin:new URL(request.url).origin};
  if(body.action==="CREATE_EVENT")return Response.json({submission:await createPartnerEventAdmin(common)},{headers:{"Cache-Control":"private, no-store"}});
  if(body.action==="LINK_EXISTING"){const canonicalId=Number(body.canonicalId);if(!Number.isSafeInteger(canonicalId)||canonicalId<=0)throw new PartnerEventError("Vyber platné existujúce podujatie.");return Response.json({submission:await linkPartnerEventAdmin({id,canonicalId,adminEmail:auth.user.email,requestId:request.headers.get("cf-ray")})},{headers:{"Cache-Control":"private, no-store"}});}
  if(body.action==="APPROVE")return Response.json({submission:await approvePartnerEventUpdateAdmin(common)},{headers:{"Cache-Control":"private, no-store"}});
  if(body.action==="REJECT")return Response.json({submission:await rejectPartnerEventAdmin({id,reasonCode:body.reasonCode,adminEmail:auth.user.email,requestId:request.headers.get("cf-ray")})},{headers:{"Cache-Control":"private, no-store"}});
  throw new PartnerEventError("Neplatná resolution akcia.");
 }catch(error){const status=error instanceof PartnerEventError?error.status:error instanceof Error&&error.name==="ModerationStateConflictError"?409:500;return Response.json({error:status>=500?"Rozhodnutie podujatia sa nepodarilo uložiť.":error instanceof Error?error.message:"Rozhodnutie zlyhalo."},{status,headers:{"Cache-Control":"private, no-store"}});}
}
