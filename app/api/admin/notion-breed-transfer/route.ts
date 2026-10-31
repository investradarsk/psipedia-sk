import { env } from "cloudflare:workers";
import { requireAdminMutation, getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
import { runNotionBreedSyncSweep, notionPageToManagedBreedInput } from "@/lib/notion-breed-sync";
import { breedFieldSnapshot, BREED_NOTION_EDITABLE_FIELDS } from "@/lib/notion-breed-field-delta";
import { notionRequest, sha256Text, type NotionPage } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";

export const dynamic="force-dynamic";
type Bindings={DB?:D1Database;NOTION_BREED_SYNC_ENABLED?:string;NOTION_API_TOKEN?:string;NOTION_BREEDS_DATA_SOURCE_ID?:string;BUCKET?:R2Bucket};
const allowed = new Set<string>(BREED_NOTION_EDITABLE_FIELDS);
function json(value:unknown,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store"}})}
async function mapped(db:D1Database,id:number){
  return db.prepare("SELECT notion_page_id,last_synced_at FROM breed_notion_sync WHERE breed_id=? LIMIT 1")
    .bind(id).first<{notion_page_id:string;last_synced_at:string}>();
}
async function lookup(id:number,field:string){
  if(!Number.isSafeInteger(id)||id<1||!allowed.has(field))throw Error("INVALID_TARGET");
  const bindings=env as unknown as Bindings;
  if(!bindings.DB||!bindings.NOTION_API_TOKEN||!bindings.NOTION_BREEDS_DATA_SOURCE_ID)
    throw Error("NOT_CONFIGURED");
  const link=await mapped(bindings.DB,id);
  if(!link)throw Error("BREED_NOT_LINKED");
  const breed=await getManagedBreed(id);
  if(!breed)throw Error("BREED_NOT_FOUND");
  const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(link.notion_page_id));
  if(page.id!==link.notion_page_id||!notionPageBelongsToDataSource(page,bindings.NOTION_BREEDS_DATA_SOURCE_ID))
    throw Error("BREED_NOTION_IDENTITY_MISMATCH");
  const snapshot=breedFieldSnapshot(notionPageToManagedBreedInput(page));
  const local=breedFieldSnapshot(breed);
  const remoteValue=snapshot[field as keyof typeof snapshot];
  const localValue=local[field as keyof typeof local];
  const hash=await sha256Text(JSON.stringify(remoteValue));
  let inbox:null|{status:string;attempts:number;outcome:string|null;last_error_code:string|null}=null;
  try{
    inbox=await bindings.DB.prepare("SELECT status,attempts,outcome,last_error_code FROM notion_webhook_inbox "+
      "WHERE page_id=? ORDER BY received_at DESC,event_key DESC LIMIT 1")
      .bind(link.notion_page_id.toLowerCase()).first<{status:string;attempts:number;outcome:string|null;last_error_code:string|null}>();
  }catch{/* Inbox migration may not be active: no fabricated success. */}
  return {bindings,link,breed,page,field,hash,remoteValue,localValue,inbox};
}
function cleanError(error:unknown){
  const code=error instanceof Error?error.message:"ERROR";
  return /^[A-Z0-9_]+$/.test(code)?code:"NOTION_DIAGNOSTICS_UNAVAILABLE";
}
export async function GET(request:Request){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  const url=new URL(request.url);
  const id=Number(url.searchParams.get("id"));
  const field=url.searchParams.get("field")??"intro";
  try{
    const found=await lookup(id,field);
    return json({breedId:id,name:found.breed.name,field,
      notionValue:found.remoteValue,adminValue:found.localValue,
      same:JSON.stringify(found.remoteValue)===JSON.stringify(found.localValue),
      expectedNotionHash:found.hash,lastSyncedAt:found.link.last_synced_at,
      adminUpdatedAt:found.breed.updatedAt,inbox:found.inbox});
  }catch(error){return json({error:cleanError(error)},400)}
}
export async function POST(request:Request){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  let body:unknown;
  try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400)}
  if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"INVALID_JSON"},400);
  const {id,field,expectedNotionHash,confirm}=body as Record<string,unknown>;
  if(typeof id!=="number"||typeof field!=="string"||typeof expectedNotionHash!=="string"||confirm!==true)
    return json({error:"INVALID_INPUT"},400);
  try{
    const found=await lookup(id,field);
    if(found.hash!==expectedNotionHash)return json({error:"BREED_EXPLICIT_REMOTE_CHANGED"},409);
    const summary=await runNotionBreedSyncSweep({
      database:found.bindings.DB!,bindings:found.bindings,targetPageId:found.page.id,
      explicitField:field as "intro",expectedNotionHash,
    });
    if(!summary.enabled||summary.failed||summary.scanned!==1)
      return json({error:"BREED_EXPLICIT_REVIEW_REQUIRED",summary},409);
    return json({ok:true,summary});
  }catch(error){return json({error:cleanError(error)},409)}
}
