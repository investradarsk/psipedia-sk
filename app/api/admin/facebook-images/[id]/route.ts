import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {getFacebookImagePost,saveFacebookImagePost} from "@/lib/facebook-image-store";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Props){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  try{const post=await getFacebookImagePost((await params).id);return post&&!post.deletedAt?Response.json({post},{headers:{"cache-control":"no-store"}}):Response.json({error:"Príspevok sa nenašiel."},{status:404});}
  catch(error){return facebookImageError(error);}
}
export async function PUT(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{return Response.json({post:await saveFacebookImagePost((await params).id,await request.json(),auth.user.email)});}
  catch(error){return facebookImageError(error);}
}
