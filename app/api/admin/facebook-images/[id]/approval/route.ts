import {requireAdminMutation} from "@/lib/admin-auth";
import {facebookImageDb,getFacebookImagePost} from "@/lib/facebook-image-store";
import {setIndividualApproval} from "@/lib/facebook-image-publisher";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{
    const data=await request.json() as Record<string,unknown>;
    if(!data||typeof data.approved!=="boolean"||!Number.isSafeInteger(data.expectedVersion)
      ||Object.keys(data).length!==2)return Response.json({error:"Neplatné schválenie."},{status:400});
    const db=facebookImageDb(),id=(await params).id;
    await setIndividualApproval(db,id,data.expectedVersion as number,data.approved,auth.user.email);
    return Response.json({post:await getFacebookImagePost(id,db)});
  }catch(error){return facebookImageError(error);}
}
