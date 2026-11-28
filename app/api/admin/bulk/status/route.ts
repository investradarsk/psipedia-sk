import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { publicationV3Enabled } from "@/lib/publication-readiness-v3";
import { applyRemainingBulkStatus, parseRemainingBulkRequest } from "@/lib/admin-bulk/remaining-status";
import { invalidateRecordPublicCache } from "@/lib/admin-record-lifecycle-cache";

export const dynamic="force-dynamic";
export async function POST(request:Request){
 const auth=await requireAdminMutation(request,{strictProvenance:true});
 if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
 const headers={"Cache-Control":"private, no-store"};
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(!publicationV3Enabled())return json({error:"Hromadná zmena vyžaduje aktivovaný režim V3."},409);
 const bindings=env as unknown as {DB?:D1Database;CF_VERSION_METADATA?:{id?:string}};
 if(!bindings.DB)return json({error:"D1 nie je dostupná."},503);
 let input:ReturnType<typeof parseRemainingBulkRequest>;
 try{input=parseRemainingBulkRequest(await request.json());}
 catch(error){return json({error:error instanceof Error?error.message:"Neplatný výber."},400);}
 try{
  const result=await applyRemainingBulkStatus(bindings.DB,auth.user.email,input);
  await Promise.allSettled(result.updated.map(item=>invalidateRecordPublicCache(input.agenda,item.slug,item.category,bindings.CF_VERSION_METADATA?.id)));
  return json({...result,updated:result.updated.map(({id})=>({id}))});
 }catch(error){return json({error:error instanceof Error?error.message:"Hromadnú zmenu sa nepodarilo potvrdiť."},409);}
}
