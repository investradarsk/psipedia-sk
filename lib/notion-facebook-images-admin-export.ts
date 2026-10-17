import {notionFlagEnabled,notionRequest} from "@/lib/notion-sync-shared";
import {facebookImagePermalink} from "@/lib/notion-facebook-images-model";

/** Admin-authoritative Notion export. D1 is committed first; failed exports are retried. */
const IMPORT_ACTOR="notion-facebook-images-sync@psipedia.sk";
const SOURCE_ID="2d945afe-0c79-467e-b9e6-6b0f62a27a49";
const LOCK_PREFIX="facebook-admin-export-lock:";
const ACK_PREFIX="facebook-admin-export:v";
const LEASE_MS=8*60*1000;
const LIMIT=20;
export type AdminExportBindings={
  NOTION_API_TOKEN?:string;
  NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED?:string;
  NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID?:string;
};
export type AdminExportSummary={enabled:boolean;scanned:number;created:number;updated:number;
  trashed:number;restored:number;failed:number;skipped:number;pending:number};
export type AdminImageRow={
  id:string;title:string;image_key:string;caption:string;
  scheduled_at:string|null;status:string;version:number;
  approval_status:string;direct_publish_consent?:number;notion_page_id:string|null;sync_hash:string|null;
  updated_by:string;deleted_at:string|null;facebook_post_id:string|null;published_at:string|null;
};
function rich(value:string){
  const parts=[];
  for(let i=0;i<value.length;i+=1800)parts.push({type:"text",text:{content:value.slice(i,i+1800)}});
  return parts;
}
export function adminExportAck(version:number){return ACK_PREFIX+version;}
export function adminExportMarker(id:string){return "PSIPEDIA_ADMIN_ID:"+id;}
export function adminExportLeaseActive(hash:string|null,now:number){
  if(!hash?.startsWith(LOCK_PREFIX))return false;
  const timestamp=Number(hash.slice(LOCK_PREFIX.length).split(":")[0]);
  return Number.isFinite(timestamp)&&timestamp>0&&now-timestamp<LEASE_MS&&now>=timestamp;
}
export function shouldExportAdminImage(row:AdminImageRow,now:number){
  return row.updated_by!==IMPORT_ACTOR
    && row.sync_hash!==adminExportAck(row.version)
    && !adminExportLeaseActive(row.sync_hash,now);
}
export function facebookAdminNotionProperties(row:AdminImageRow){
  const photo=/^facebook-images\/\d{4}\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(row.image_key)
    ? "https://psipedia.sk/media/"+row.image_key : "";
  const filename=row.image_key.split("/").pop()||"obrazok.png";
  return {
    "Názov":{title:rich(row.title.slice(0,200))},
    "Text na Facebook":{rich_text:rich(row.caption.slice(0,15000))},
    "Obrázok":{files:photo?[{name:filename,type:"external",external:{url:photo}}]:[]},
    "Stav":{status:{name:row.status==="published"?"Publikované":
      row.status==="scheduled"?"Naplánované":"Koncept"}},
    "Povoliť publikovanie":{checkbox:row.approval_status==="APPROVED"},
    // This is a D1 admin-owned projection. Notion cannot grant owner consent.
    "Súhlas majiteľa – priame publikovanie":{checkbox:row.direct_publish_consent===1},
    "Dátum a čas publikovania":{date:row.scheduled_at?{start:row.scheduled_at}:null},
    "Facebook Post ID":{rich_text:rich(row.facebook_post_id||"")},
    "Facebook URL":{url:row.facebook_post_id?facebookImagePermalink(row.facebook_post_id):null},
    "Publikované o":{date:row.published_at?{start:row.published_at}:null},
  };
}
type NotionPageResponse={id:string;in_trash?:boolean;archived?:boolean};
type NotionQuery={results?:NotionPageResponse[];has_more?:boolean};
async function findOwnedPage(bindings:AdminExportBindings,id:string){
  const result=await notionRequest<NotionQuery>(bindings,"/data_sources/"+SOURCE_ID+"/query",{
    method:"POST",body:JSON.stringify({page_size:3,
      filter:{property:"Poznámka",rich_text:{contains:adminExportMarker(id)}}}),
  });
  if((result.results?.length??0)>1||result.has_more)throw new Error("Ambiguous Notion admin ID.");
  return result.results?.[0]?.id??null;
}
async function writeNotionPage(bindings:AdminExportBindings,row:AdminImageRow){
  const props=facebookAdminNotionProperties(row);
  const identity=row.notion_page_id||await findOwnedPage(bindings,row.id);
  if(row.deleted_at){
    // A local tombstone is never deleted. Archive an existing remote page only.
    if(identity)await notionRequest(bindings,"/pages/"+encodeURIComponent(identity),{
      method:"PATCH",body:JSON.stringify({in_trash:true}),
    });
    return {identity,created:false,trashed:Boolean(identity),restored:false};
  }
  if(identity){
    const state=await notionRequest<NotionPageResponse>(bindings,"/pages/"+encodeURIComponent(identity));
    const restore=Boolean(state.in_trash||state.archived);
    if(restore)await notionRequest(bindings,"/pages/"+encodeURIComponent(identity),{
      method:"PATCH",body:JSON.stringify({in_trash:false}),
    });
    await notionRequest(bindings,"/pages/"+encodeURIComponent(identity),{
      method:"PATCH",body:JSON.stringify({properties:props}),
    });
    return {identity,created:false,trashed:false,restored:restore};
  }
  // Search-by-stable-marker before CREATE avoids duplicates after a lost response.
  const created=await notionRequest<NotionPageResponse>(bindings,"/pages",{
    method:"POST",body:JSON.stringify({
      parent:{type:"data_source_id",data_source_id:SOURCE_ID},
      properties:{...props,
        "Poznámka":{rich_text:rich(adminExportMarker(row.id)+" | Spravované v Psipedia administrácii.")}},
    }),
  });
  if(!/^[a-f0-9-]{36}$/i.test(created.id))throw new Error("Notion did not return a page ID.");
  return {identity:created.id,created:true,trashed:false,restored:false};
}
function isMissingTrashColumn(error:unknown){
  return error instanceof Error&&/no such column:\s*deleted_at/i.test(error.message);
}
export async function exportFacebookAdminChanges(args:{
  db:D1Database;bindings:AdminExportBindings;now?:Date;
}):Promise<AdminExportSummary>{
  const {db,bindings,now=new Date()}=args;
  const result:AdminExportSummary={enabled:notionFlagEnabled(
    bindings.NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED),
    scanned:0,created:0,updated:0,trashed:0,restored:0,failed:0,skipped:0,pending:0};
  if(!result.enabled)return result;
  if(bindings.NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID!==SOURCE_ID||!bindings.NOTION_API_TOKEN)
    throw new Error("Notion Facebook admin export is not configured.");
  let trash=true;
  try{await db.prepare("SELECT deleted_at FROM facebook_image_posts LIMIT 0").all();}
  catch(error){if(isMissingTrashColumn(error))trash=false;else throw error;}
  let consent=false;
  try{await db.prepare("SELECT direct_publish_consent FROM facebook_image_posts LIMIT 0").all();consent=true;}
  catch(error){if(!(error instanceof Error&&/no such column:\s*direct_publish_consent/i.test(error.message)))throw error;}
  const where="updated_by<>? AND (sync_hash IS NULL OR sync_hash <> '"+ACK_PREFIX+"' || version)";
  const rows=await db.prepare("SELECT id,title,image_key,caption,scheduled_at,status,version,"+
    "approval_status,"+(consent?"direct_publish_consent":"0 AS direct_publish_consent")+
    ",notion_page_id,sync_hash,updated_by,"+
    (trash?"deleted_at":"NULL AS deleted_at")+",facebook_post_id,published_at "+
    "FROM facebook_image_posts WHERE "+where+" ORDER BY updated_at DESC,id LIMIT 100")
    .bind(IMPORT_ACTOR).all<AdminImageRow>();
  for(const row of rows.results){
    if(result.scanned>=LIMIT)break;
    if(!shouldExportAdminImage(row,now.getTime())){result.skipped++;continue;}
    result.scanned++;
    const lease=LOCK_PREFIX+now.getTime()+":"+crypto.randomUUID();
    const claimed=await db.prepare("UPDATE facebook_image_posts SET sync_hash=? "+
      "WHERE id=? AND version=? AND sync_hash IS ? AND updated_by<>? RETURNING id")
      .bind(lease,row.id,row.version,row.sync_hash,IMPORT_ACTOR).first<{id:string}>();
    if(!claimed){result.skipped++;continue;}
    try{
      const remote=await writeNotionPage(bindings,row);
      if(remote.identity){
        await db.prepare("UPDATE facebook_image_posts SET notion_page_id=? WHERE id=? "+
          "AND (notion_page_id IS NULL OR notion_page_id=?)")
          .bind(remote.identity,row.id,remote.identity).run();
      }
      const ack=await db.prepare("UPDATE facebook_image_posts SET sync_hash=? "+
        "WHERE id=? AND version=? AND sync_hash=? RETURNING id")
        .bind(adminExportAck(row.version),row.id,row.version,lease).first<{id:string}>();
      if(ack){
        if(remote.trashed)result.trashed++;
        else if(remote.restored)result.restored++;
        else if(remote.created)result.created++;
        else result.updated++;
      }else{
        // Newer admin revisions must never be acknowledged by a stale export.
        await db.prepare("UPDATE facebook_image_posts SET sync_hash=NULL WHERE id=? AND sync_hash=?")
          .bind(row.id,lease).run();
        result.pending++;
      }
    }catch{
      // Do not log Notion credentials, signed URLs or private page properties.
      await db.prepare("UPDATE facebook_image_posts SET sync_hash=? WHERE id=? AND sync_hash=?")
        .bind(row.sync_hash,row.id,lease).run();
      result.failed++;
    }
  }
  return result;
}
