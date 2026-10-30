import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { runBreedIdentityBackfill } from "@/lib/notion-breed-identity-backfill";

export const dynamic="force-dynamic";

// A protected, explicitly owner-triggered operation. No public or background
// writes and no Notion secret or raw profile data in the response.
export async function POST(request:Request){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response || !auth.user)return auth.response??unauthorizedAdminResponse();
  if(request.headers.get("origin")!==new URL(request.url).origin ||
     !request.headers.get("content-type")?.startsWith("application/json")){
    return Response.json({error:"Neplatný pôvod požiadavky."},{status:403});
  }
  const body=await request.json().catch(()=>null) as {mode?:unknown}|null;
  if(body?.mode!=="preview" && body?.mode!=="apply")
    return Response.json({error:"Vyber kontrolu alebo výslovné doplnenie."},{status:400});
  const bindings=env as unknown as {
    DB?:D1Database;NOTION_API_TOKEN?:string;NOTION_BREEDS_DATA_SOURCE_ID?:string;
  };
  if(!bindings.DB)return Response.json({error:"Chýba D1."},{status:503});
  try{
    const summary=await runBreedIdentityBackfill({
      db:bindings.DB,bindings,apply:body.mode==="apply",maxWrites:20,
    });
    return Response.json({summary},{headers:{"cache-control":"no-store"}});
  }catch{
    return Response.json({error:"Prepojenie neprebehlo: skontrolujte Notion/D1 konfiguráciu a produkčné logy."},{status:503});
  }
}
