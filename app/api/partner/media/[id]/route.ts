import { requirePartnerAccount } from "@/lib/partner-auth";
import { abandonPartnerPendingMedia, PartnerMediaError, readPartnerMediaPreview } from "@/lib/partner-media";
import { assertPartnerMutationOrigin, PartnerSecurityError } from "@/lib/partner-security";
export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const {id}=await params;
    const {object}=await readPartnerMediaPreview({id,accountId:identity.accountId});
    return new Response(object.body,{headers:{"content-type":"image/webp","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  }catch(error){return new Response("Not found",{status:error instanceof PartnerMediaError?error.status:404});}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    assertPartnerMutationOrigin(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const {id}=await params;
    const media=await abandonPartnerPendingMedia({id,accountId:identity.accountId});
    return Response.json({media},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerMediaError||error instanceof PartnerSecurityError?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:400;
    return Response.json({error:error instanceof Error?error.message:"Odstránenie zlyhalo."},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}
