import { requireAdminMutation } from "@/lib/admin-auth";
import { getQualityMissingDatabase, reviewMissingQualityProposal } from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdminMutation(request);
  if(auth.response||!auth.user)return auth.response!;
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({error:"Požadovaný je JSON."},{status:415});
  const {id}=await params;
  if(!/^\d+$/.test(id)||Number(id)<1)return Response.json({error:"Neplatný návrh."},{status:400});
  let body:{action?:unknown};
  try{body=await request.json() as {action?:unknown}}catch{return Response.json({error:"Neplatné JSON."},{status:400})}
  if(body.action!=="accept"&&body.action!=="reject")return Response.json({error:"Neplatná akcia."},{status:400});
  try{
    await reviewMissingQualityProposal(getQualityMissingDatabase(),Number(id),body.action,auth.user.email);
    return Response.json({ok:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Návrh sa nepodarilo spracovať.";
    const conflict=/medzičasom|spracovaný|Obnov stránku/.test(message);
    console.error(JSON.stringify({event:"quality_missing_review_error",reason:message}));
    return Response.json({error:message},{status:conflict?409:422});
  }
}
