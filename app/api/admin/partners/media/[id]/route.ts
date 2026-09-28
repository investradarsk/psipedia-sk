import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { PartnerMediaError, readPartnerMediaPreview } from "@/lib/partner-media";
export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  try{
    const {id}=await params;
    const {object}=await readPartnerMediaPreview({id,admin:true});
    return new Response(object.body,{headers:{"content-type":"image/webp","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  }catch(error){return new Response("Not found",{status:error instanceof PartnerMediaError?error.status:404});}
}
