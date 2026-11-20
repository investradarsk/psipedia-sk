import { requirePartnerAccount } from "@/lib/partner-auth";
import { searchPartnerClaimableRecords } from "@/lib/partner-claim-search";
import { isPartnerClaimableResourceType } from "@/lib/partner-claims";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

export async function GET(request:Request){
  try{
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)return Response.json({error:"Dokončite nastavenie účtu."},{status:403,headers});
    const search=new URL(request.url).searchParams;
    const type=search.get("type");
    const query=(search.get("q")??"").trim().slice(0,80);
    if(!isPartnerClaimableResourceType(type))
      return Response.json({error:"Vyberte platnú oblasť."},{status:400,headers});
    if(query.length<1)return Response.json({items:[]},{headers});
    const items=await searchPartnerClaimableRecords({entityType:type,query,suggest:true});
    return Response.json({items},{headers});
  }catch(error){
    console.error("Partner claim suggest failed",error);
    return Response.json({error:"Vyhľadávanie momentálne nie je dostupné."},{status:503,headers});
  }
}
