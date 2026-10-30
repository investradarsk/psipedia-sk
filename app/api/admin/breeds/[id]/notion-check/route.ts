import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
import { notionNumberProperty, notionRequest, notionRichTextProperty, type NotionPage } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { runNotionBreedSyncSweep } from "@/lib/notion-breed-sync";

export const dynamic="force-dynamic";
type RouteProps={params:Promise<{id:string}>};
type Binding={
  DB?:D1Database;NOTION_API_TOKEN?:string;NOTION_BREEDS_DATA_SOURCE_ID?:string;
  NOTION_BREED_SYNC_ENABLED?:string;BUCKET?:R2Bucket;
};
function getId(value:string){
  return /^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
}
async function readStatus(id:number,bindings:Binding){
  if(!bindings.DB || !bindings.NOTION_API_TOKEN || !bindings.NOTION_BREEDS_DATA_SOURCE_ID)
    throw new Error("NOTION_BREED_SYNC_NOT_CONFIGURED");
  const breed=await getManagedBreed(id);
  if(!breed)throw new Error("BREED_NOT_FOUND");
  const mapping=await bindings.DB.prepare(
    "SELECT notion_page_id,content_hash,last_synced_at FROM breed_notion_sync WHERE breed_id=? LIMIT 1"
  ).bind(id).first<{notion_page_id:string;content_hash:string;last_synced_at:string}>();
  if(!mapping)return {linked:false,adminChildren:breed.children??null,notionChildren:null,queue:[],lastSyncedAt:null,receipt:"missing"} as const;
  const notion=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(mapping.notion_page_id));
  if(notion.id!==mapping.notion_page_id
    || !notionPageBelongsToDataSource(notion,bindings.NOTION_BREEDS_DATA_SOURCE_ID)
    || notionRichTextProperty(notion,"Psipedia ID")!==String(id))
    throw new Error("BREED_NOTION_IDENTITY_MISMATCH");
  const events=await bindings.DB.prepare(
    "SELECT status,outcome,attempts,last_error_code,received_at,updated_at "+
    "FROM notion_webhook_inbox WHERE page_id=? ORDER BY received_at DESC LIMIT 3"
  ).bind(mapping.notion_page_id).all<{
    status:string;outcome:string|null;attempts:number;last_error_code:string|null;
    received_at:number;updated_at:number;
  }>();
  return {
    linked:true,adminChildren:breed.children??null,
    notionChildren:notionNumberProperty(notion,"Deti"),
    lastSyncedAt:mapping.last_synced_at,
    receipt:mapping.content_hash.startsWith("breed-field-v1:")?"per-field":
      mapping.content_hash.startsWith("identity-pending-editorial:")?"pending":"legacy",
    queue:events.results.map(x=>({
      status:x.status,outcome:x.outcome,attempts:x.attempts,
      error:x.last_error_code,receivedAt:x.received_at,
    })),
  };
}
export async function GET(_request:Request,{params}:RouteProps){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const id=getId((await params).id);
  if(!id)return Response.json({error:"Neplatné ID."},{status:400});
  try{
    return Response.json(await readStatus(id,env as Binding),{headers:{"cache-control":"no-store"}});
  }catch(error){
    const code=error instanceof Error?error.message:"BREED_SYNC_CHECK_FAILED";
    return Response.json({error:code},{status:code==="BREED_NOT_FOUND"?404:503});
  }
}
export async function POST(request:Request,{params}:RouteProps){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  const id=getId((await params).id);
  if(!id)return Response.json({error:"Neplatné ID."},{status:400});
  const body=await request.json().catch(()=>null) as {field?:unknown}|null;
  if(body?.field!=="children")return Response.json({error:"Nepovolené pole."},{status:400});
  const bindings=env as Binding;
  try{
    const before=await readStatus(id,bindings);
    if(!before.linked)return Response.json({error:"Plemeno nie je prepojené."},{status:409});
    const mapping=await bindings.DB!.prepare(
      "SELECT notion_page_id FROM breed_notion_sync WHERE breed_id=? LIMIT 1"
    ).bind(id).first<{notion_page_id:string}>();
    if(!mapping)return Response.json({error:"Prepojenie už neexistuje."},{status:409});
    const summary=await runNotionBreedSyncSweep({
      database:bindings.DB!,bindings,
      targetPageId:mapping.notion_page_id,forceFields:["children"],
    });
    const after=await readStatus(id,bindings);
    return Response.json({summary,before,after,matched:after.linked
      && after.adminChildren===after.notionChildren},{
      status:summary.failed?409:200,headers:{"cache-control":"no-store"},
    });
  }catch(error){
    const code=error instanceof Error?error.message:"BREED_SYNC_RETRY_FAILED";
    return Response.json({error:code},{status:500});
  }
}
