import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {listFacebookImagePosts,saveFacebookImagePost} from "@/lib/facebook-image-store";
import {facebookWallTime} from "@/lib/facebook-image-post";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  const p=new URL(request.url).searchParams;
  try{return Response.json(await listFacebookImagePosts(p.get("month")||facebookWallTime(new Date().toISOString()).date.slice(0,7),p.get("status")||"all",Number(p.get("page")||1)),{headers:{"cache-control":"no-store"}});}
  catch(error){return facebookImageError(error);}
}
export async function POST(request:Request){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{return Response.json({post:await saveFacebookImagePost(null,await request.json(),auth.user.email)},{status:201});}
  catch(error){return facebookImageError(error);}
}
