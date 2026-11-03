import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {getFacebookImagePost,saveFacebookImagePost,updateFacebookImageDraftInlineText} from "@/lib/facebook-image-store";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Props){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  try{const post=await getFacebookImagePost((await params).id);return post&&!post.deletedAt?Response.json({post},{headers:{"cache-control":"no-store"}}):Response.json({error:"Príspevok sa nenašiel."},{status:404});}
  catch(error){return facebookImageError(error);}
}
export async function PATCH(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  if(request.headers.get("origin")!==new URL(request.url).origin ||
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return Response.json({error:"Neplatný pôvod požiadavky."},{status:403});
  }
  try{
    const id=(await params).id;
    const body:unknown=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body))return Response.json({error:"Neplatné dáta."},{status:400});
    const data=body as Record<string,unknown>;
    if(Object.keys(data).length!==4||data.action!=="set-inline-text"||
      typeof data.expectedVersion!=="number"||!Number.isSafeInteger(data.expectedVersion)||
      typeof data.title!=="string"||typeof data.caption!=="string"){
      return Response.json({error:"Povolená je len zmena titulku a textu konceptu."},{status:400});
    }
    const post=await updateFacebookImageDraftInlineText(id,{
      title:data.title,caption:data.caption,
    },data.expectedVersion,auth.user.email);
    return Response.json({post},{headers:{"cache-control":"no-store"}});
  }catch(error){return facebookImageError(error);}
}
export async function PUT(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{return Response.json({post:await saveFacebookImagePost((await params).id,await request.json(),auth.user.email)});}
  catch(error){return facebookImageError(error);}
}
