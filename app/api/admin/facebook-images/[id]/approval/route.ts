import {env} from "cloudflare:workers";
import {requireAdminMutation} from "@/lib/admin-auth";
import {facebookImageDb,getFacebookImagePost} from "@/lib/facebook-image-store";
import {setIndividualApproval,setDirectPublishConsent} from "@/lib/facebook-image-publisher";
import {facebookImageError} from "@/lib/facebook-image-api";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);if(auth.response)return auth.response;
  try{
    const data=await request.json() as Record<string,unknown>;
    const mode=data?.mode??"scheduled";
    if(!data||typeof data.approved!=="boolean"||!Number.isSafeInteger(data.expectedVersion)
      ||!["scheduled","direct"].includes(String(mode))
      ||Object.keys(data).some(key=>!["approved","expectedVersion","mode"].includes(key)))
      return Response.json({error:"Neplatné schválenie."},{status:400});
    if(mode==="direct"){
      // Explicit owner identity, not merely anyone with access to the admin.
      // No default owner; deployment must deliberately provision this setting.
      const owner=(env as unknown as {FACEBOOK_IMAGES_OWNER_EMAIL?:string})
        .FACEBOOK_IMAGES_OWNER_EMAIL?.trim().toLowerCase();
      if(!owner||auth.user.email.trim().toLowerCase()!==owner)
        return Response.json({error:"Priame publikovanie môže povoliť iba nakonfigurovaný majiteľ."},{status:403});
    }
    const db=facebookImageDb(),id=(await params).id;
    if(mode==="direct")
      await setDirectPublishConsent(db,id,data.expectedVersion as number,data.approved as boolean,auth.user.email);
    else
      await setIndividualApproval(db,id,data.expectedVersion as number,data.approved as boolean,auth.user.email);
    return Response.json({post:await getFacebookImagePost(id,db)});
  }catch(error){return facebookImageError(error);}
}
