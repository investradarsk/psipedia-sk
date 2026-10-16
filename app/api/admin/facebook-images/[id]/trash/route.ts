import {requireAdminMutation} from "@/lib/admin-auth";
import {facebookImageDb,getFacebookImagePost} from "@/lib/facebook-image-store";
import {FacebookTrashMigrationNeeded,setFacebookImageTrashed} from "@/lib/facebook-image-trash";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Props) {
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  try {
    const body=await request.json() as {action?:unknown;expectedVersion?:unknown};
    if(!body||!["trash","restore"].includes(String(body.action))
      ||!Number.isSafeInteger(body.expectedVersion)
      ||Object.keys(body).some(key=>!["action","expectedVersion"].includes(key)))
      return Response.json({error:"Neplatná operácia s košom."},{status:400});
    const db=facebookImageDb(),id=(await params).id;
    await setFacebookImageTrashed({db,id,actor:auth.user.email,
      action:body.action as "trash"|"restore",expectedVersion:body.expectedVersion as number});
    return Response.json({post:await getFacebookImagePost(id,db)},
      {headers:{"cache-control":"no-store"}});
  }catch(error) {
    if(error instanceof FacebookTrashMigrationNeeded)
      return Response.json({error:error.message},{status:503});
    return facebookImageError(error);
  }
}
