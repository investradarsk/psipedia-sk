import {requireAdminMutation} from "@/lib/admin-auth";
import {facebookImageDb} from "@/lib/facebook-image-store";
import {FacebookTrashMigrationNeeded,permanentlyDeleteFacebookImage} from "@/lib/facebook-image-trash";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
/** Tombstone is non-restorable; Notion is archived asynchronously by admin-export.
 * Existing Facebook posts are not deleted at Meta.
 */
export async function DELETE(request:Request,{params}:Props) {
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  try {
    const body=await request.json() as {confirm?:unknown;expectedVersion?:unknown};
    if(!body||body.confirm!==true||!Number.isSafeInteger(body.expectedVersion)
      ||Object.keys(body).some(key=>!["confirm","expectedVersion"].includes(key)))
      return Response.json({error:"Potvrď nevratné odstránenie aktuálnej verzie."},{status:400});
    const db=facebookImageDb(),id=(await params).id;
    await permanentlyDeleteFacebookImage({db,id,actor:auth.user.email,
      expectedVersion:body.expectedVersion as number});
    return Response.json({deleted:true},{headers:{"cache-control":"no-store"}});
  }catch(error) {
    if(error instanceof FacebookTrashMigrationNeeded)
      return Response.json({error:error.message},{status:503});
    return facebookImageError(error);
  }
}
