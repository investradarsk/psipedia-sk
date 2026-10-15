import {env} from "cloudflare:workers";
import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {facebookImageDb} from "@/lib/facebook-image-store";
import {publisherConfig,setPublisherEnabled} from "@/lib/facebook-image-publisher";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
export async function GET(){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  try {return Response.json(await publisherConfig(facebookImageDb(),env),{headers:{"cache-control":"no-store"}});}
  catch(error){return facebookImageError(error);}
}
export async function PUT(request:Request){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{
    const data=await request.json() as Record<string,unknown>;
    if(!data||typeof data.enabled!=="boolean"||Object.keys(data).length!==1)
      return Response.json({error:"Neplatná hodnota prepínača."},{status:400});
    const db=facebookImageDb();
    await setPublisherEnabled(db,data.enabled,auth.user.email);
    return Response.json(await publisherConfig(db,env));
  }catch(error){return facebookImageError(error);}
}
