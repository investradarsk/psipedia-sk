import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {loadAdminWorkspaceFeed,markAdminWorkspaceEventRead} from "@/lib/admin-workspace-feed";
export const dynamic="force-dynamic";
export async function GET(){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  return Response.json(await loadAdminWorkspaceFeed(user.email),{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
  const auth=await requireAdminMutation(request);
  if(auth.response||!auth.user)return auth.response!;
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({error:"Požadovaný je JSON."},{status:415});
  let value:{id?:unknown};
  try{value=await request.json() as {id?:unknown}}catch{return Response.json({error:"Neplatný JSON."},{status:400})}
  if(typeof value.id!=="number"||!Number.isSafeInteger(value.id)||value.id<=0)
    return Response.json({error:"Neplatné oznámenie."},{status:400});
  try{return Response.json(await markAdminWorkspaceEventRead(auth.user.email,value.id))}
  catch{return Response.json({error:"Nepodarilo sa označiť ako prečítané."},{status:500})}
}
