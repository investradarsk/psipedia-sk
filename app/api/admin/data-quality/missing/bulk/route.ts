import { requireAdminMutation } from "@/lib/admin-auth";
import { getQualityMissingDatabase, reviewMissingQualityProposal } from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";
export async function POST(request:Request) {
  const auth=await requireAdminMutation(request);
  if(auth.response||!auth.user)return auth.response!;
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({error:"Požadovaný je JSON."},{status:415});
  let body:{ids?:unknown};
  try{body=await request.json() as {ids?:unknown}}catch{return Response.json({error:"Neplatné JSON."},{status:400})}
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>200||
    body.ids.some(x=>!Number.isSafeInteger(x)||x<1)||
    new Set(body.ids).size!==body.ids.length) {
    return Response.json({error:"Vyber najviac 200 platných návrhov."},{status:400});
  }
  const db=getQualityMissingDatabase();
  const dismissed:number[]=[];
  const failures:number[]=[];
  for(const id of body.ids as number[]) {
    try {await reviewMissingQualityProposal(db,id,"reject",auth.user.email);dismissed.push(id)}
    catch {failures.push(id)}
  }
  return Response.json({dismissed,failures});
}
