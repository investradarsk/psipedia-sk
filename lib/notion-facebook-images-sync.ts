import {exportFacebookAdminChanges} from "@/lib/notion-facebook-images-admin-export";
import {facebookImageScheduleV2Policy,notionFacebookScheduleV2Decision} from "@/lib/facebook-image-schedule-v2";
import {downloadRemoteImage,notionFlagEnabled,notionRequest,sha256Text,type NotionSyncBindings} from "@/lib/notion-sync-shared";
import {notionFacebookImageSnapshot,notionFacebookSnapshotFingerprint,facebookImagePermalink,type NotionFacebookImagePage} from "@/lib/notion-facebook-images-model";

/** Dedicated new Notion database; legacy Facebook editorial entries are never read or modified. */
export const NOTION_FACEBOOK_IMAGES_SOURCE_ID="2d945afe-0c79-467e-b9e6-6b0f62a27a49";
const ACTOR="notion-facebook-images-sync@psipedia.sk";
export type FacebookImagesSyncBindings=NotionSyncBindings & {
  NOTION_FACEBOOK_IMAGES_SYNC_ENABLED?:string;
  NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID?:string;
  NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED?:string;
  NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED?:string;
  NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_CUTOVER_AT?:string;
};
type Page=NotionFacebookImagePage;
type Query={results?:Page[];has_more?:boolean;next_cursor?:string|null};
type Linked={id:string;status:string;title:string;caption:string;scheduled_at:string|null;
  updated_at:string;version:number;image_url:string;image_key:string;updated_by:string;
  sync_hash:string|null;facebook_post_id:string|null;published_at:string|null;
  attempt_state:string|null;error_code:string|null;
  approval_status:string;direct_publish_consent:number};
export type FacebookImagesSyncSummary={enabled:boolean;scanned:number;created:number;
  updated:number;unchanged:number;conflicts:number;failed:number;invalid:number;
  writtenBack:number;hasMore:boolean;adminExport?:Awaited<ReturnType<typeof exportFacebookAdminChanges>>};
function textProperty(page:Page,key:string):string {
  const value=page.properties?.[key] as {rich_text?:Array<{plain_text?:string}>}|undefined;
  return (value?.rich_text??[]).map(p=>p.plain_text??"").join("");
}
function statusProperty(page:Page) {
  const value=page.properties?.["Stav"] as {status?:{name?:string}}|undefined;
  return value?.status?.name??"";
}
function urlProperty(page:Page) {
  const value=page.properties?.["Facebook URL"] as {url?:string|null}|undefined;
  return value?.url??"";
}
async function linked(db:D1Database,pageId:string,consentReady:boolean) {
  const sql="SELECT p.id,p.status,p.title,p.caption,p.scheduled_at,p.updated_at,p.version,"+
    "p.image_url,p.image_key,p.updated_by,p.sync_hash,p.approval_status,"+
    (consentReady?"p.direct_publish_consent":"0 AS direct_publish_consent")+
    ",p.facebook_post_id,p.published_at,a.state AS attempt_state,a.error_code "+
    "FROM facebook_image_posts p LEFT JOIN facebook_image_publish_attempts a ON a.post_id=p.id "+
    "WHERE p.notion_page_id=?";
  return db.prepare(sql).bind(pageId).first<Linked>();
}
/** Notion checkbox edits are NOT owner approval. Converge both checkboxes
 * back to the canonical D1 values, including on newly imported drafts.
 */
async function mirrorApprovalToNotion(bindings:FacebookImagesSyncBindings,page:Page,post:Linked|null){
  if(!post)return false;
  const expected=post.approval_status==="APPROVED";
  const direct=post.direct_publish_consent===1;
  const a=(page.properties?.["Povoliť publikovanie"] as {checkbox?:boolean}|undefined)?.checkbox===true;
  const b=(page.properties?.["Súhlas majiteľa – priame publikovanie"] as {checkbox?:boolean}|undefined)?.checkbox===true;
  if(a===expected&&b===direct)return false;
  await notionRequest(bindings,"/pages/"+encodeURIComponent(page.id),{
    method:"PATCH",body:JSON.stringify({properties:{
      "Povoliť publikovanie":{checkbox:expected},
      "Súhlas majiteľa – priame publikovanie":{checkbox:direct},
    }}),
  });
  page.properties={...page.properties,
    "Povoliť publikovanie":{checkbox:expected},
    "Súhlas majiteľa – priame publikovanie":{checkbox:direct}};
  return true;
}
async function writeBack(bindings:FacebookImagesSyncBindings,page:Page,post:Linked):Promise<boolean> {
  let properties:Record<string,unknown>|null=null;
  if(post.status==="published" && post.facebook_post_id) {
    const id=post.facebook_post_id;
    const link=facebookImagePermalink(id);
    if(statusProperty(page)==="Publikované" && textProperty(page,"Facebook Post ID")===id
      && urlProperty(page)===(link??"")) return false;
    properties={
      "Stav":{status:{name:"Publikované"}},
      "Facebook Post ID":{rich_text:[{text:{content:id}}]},
      "Facebook URL":{url:link},
      "Chyba publikovania":{rich_text:[]},
      ...(post.published_at?{"Publikované o":{date:{start:post.published_at}}}:{}),
    };
  }else if(post.attempt_state==="UNCERTAIN") {
    const message="Na preverenie: "+(post.error_code??"neznámy výsledok");
    if(statusProperty(page)==="Chyba" && textProperty(page,"Chyba publikovania")===message)return false;
    properties={
      "Stav":{status:{name:"Chyba"}},
      "Chyba publikovania":{rich_text:[{text:{content:message}}]},
    };
  }
  if(!properties)return false;
  await notionRequest(bindings,"/pages/"+encodeURIComponent(page.id),{
    method:"PATCH",body:JSON.stringify({properties}),
  });
  return true;
}
/** Mirror scheduling results without touching published canonical content. */
async function mirrorV2ScheduleState(bindings:FacebookImagesSyncBindings,page:Page,
  scheduled:boolean,wasScheduled:boolean,oldSchedule:string|null,snapSchedule:string|null){
  let props:Record<string,unknown>|null=null;
  if(scheduled&&statusProperty(page)!=="Naplánované")
    props={"Stav":{status:{name:"Naplánované"}}};
  else if(!scheduled&&wasScheduled){
    props={"Stav":{status:{name:"Koncept"}}};
    if(snapSchedule&&snapSchedule===oldSchedule&&statusProperty(page)==="Koncept")
      props["Dátum a čas publikovania"]={date:null};
  }
  if(!props)return false;
  await notionRequest(bindings,"/pages/"+encodeURIComponent(page.id),{
    method:"PATCH",body:JSON.stringify({properties:props}),
  });
  page.properties={...page.properties,...props};
  return true;
}
async function imageForPage(bindings:FacebookImagesSyncBindings,
  source:{url:string;identity:string},old:Linked|null) {
  if(!source.url)return {key:"",url:""};
  const bucket=bindings.BUCKET;
  if(!bucket)throw new Error("R2 storage missing.");
  if(old?.image_key) {
    const existing=await bucket.head(old.image_key);
    if(existing?.customMetadata?.notionFileIdentity===source.identity)
      return {key:old.image_key,url:old.image_url};
  }
  const remote=await downloadRemoteImage(source.url);
  if(!["image/jpeg","image/png","image/webp"].includes(remote.contentType))
    throw new Error("Facebook images accept JPG, PNG or WebP.");
  const key="facebook-images/"+new Date().getUTCFullYear()+"/"+
    crypto.randomUUID()+"."+remote.extension;
  await bucket.put(key,remote.bytes,{
    httpMetadata:{contentType:remote.contentType,
      cacheControl:"public, max-age=31536000, immutable"},
    customMetadata:{source:"notion-facebook-images-sync",
      notionFileIdentity:source.identity.slice(0,400)},
  });
  return {key,url:"/media/"+key};
}
export async function runNotionFacebookImagesSync({
  database:db,bindings,now=new Date(),
}:{
  database:D1Database;bindings:FacebookImagesSyncBindings;now?:Date;
}):Promise<FacebookImagesSyncSummary> {
  const out:FacebookImagesSyncSummary={enabled:notionFlagEnabled(bindings.NOTION_FACEBOOK_IMAGES_SYNC_ENABLED),
    scanned:0,created:0,updated:0,unchanged:0,conflicts:0,failed:0,invalid:0,writtenBack:0,hasMore:false};
  if(!out.enabled)return out;
  if(bindings.NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID?.trim()!==NOTION_FACEBOOK_IMAGES_SOURCE_ID)
    throw new Error("Unexpected Facebook images Notion source ID.");
  if(!bindings.NOTION_API_TOKEN?.trim()||!bindings.BUCKET)
    throw new Error("Missing Notion API token or R2 bucket.");
  const policy=facebookImageScheduleV2Policy(bindings);
  await db.prepare("SELECT notion_page_id,sync_hash FROM facebook_image_posts LIMIT 0").all();
  await db.prepare("SELECT post_id,state FROM facebook_image_publish_attempts LIMIT 0").all();
  // Legacy behavior is unchanged while V2 is disabled. V2 ingests newer
  // Notion edits first, before the admin export could overwrite them.
  if(!policy.enabled)out.adminExport=await exportFacebookAdminChanges({db,bindings,now});
  let consentReady=false;
  try{await db.prepare("SELECT direct_publish_consent FROM facebook_image_posts LIMIT 0").all();consentReady=true;}
  catch(error){if(!(error instanceof Error&&/no such column:\s*direct_publish_consent/i.test(error.message)))throw error;}
  let trashReady=false;
  try {await db.prepare("SELECT deleted_at FROM facebook_image_posts LIMIT 0").all();trashReady=true;}
  catch(error){if(!(error instanceof Error && /no such column:\s*deleted_at/i.test(error.message)))throw error;}
  const pages:Page[]=[];
  let cursor:string|null=null;
  do {
    const response=await notionRequest<Query>(bindings,
      "/data_sources/"+NOTION_FACEBOOK_IMAGES_SOURCE_ID+"/query",{
        method:"POST",body:JSON.stringify({
          page_size:Math.min(50,100-pages.length),
          sorts:[{timestamp:"last_edited_time",direction:"descending"}],
          ...(cursor?{start_cursor:cursor}:{}),
        }),
      });
    pages.push(...(response.results??[]));
    cursor=response.has_more&&response.next_cursor?response.next_cursor:null;
  }while(cursor&&pages.length<100);
  out.hasMore=Boolean(cursor);
  for(const page of pages) {
    out.scanned++;
    try {
      if(!/^[a-f0-9-]{36}$/i.test(page.id)){out.invalid++;continue;}
      const current=await linked(db,page.id,consentReady);
      // Linked Notion tombstone is preserved: never re-import or write back a trashed post.
      if(current&&trashReady) {
        const deleted=await db.prepare("SELECT deleted_at FROM facebook_image_posts WHERE id=?")
          .bind(current.id).first<{deleted_at:string|null}>();
        if(deleted?.deleted_at){out.unchanged++;continue;}
      }
      if(!policy.enabled&&current&&await mirrorApprovalToNotion(bindings,page,current))out.writtenBack++;
      if(current&&(current.status==="published"||current.attempt_state)) {
        if(await writeBack(bindings,page,current))out.writtenBack++;
        else out.unchanged++;
        continue;
      }
      const snap=notionFacebookImageSnapshot(page,now);
      if(!snap.name&&!policy.enabled){out.invalid++;continue;}
      // A new Notion post needs only image + date/time; title is internal.
      const title=snap.name||"Facebook obrázok";
      if(!policy.enabled&&snap.warning)out.invalid++;
      if(!current&&["Publikované","Chyba"].includes(snap.notionState)){out.invalid++;continue;}
      // Notion checkboxes are observational only; their toggling cannot change
      // the canonical import fingerprint, nor trigger a permission transition.
      const hash=await sha256Text(notionFacebookSnapshotFingerprint({
        ...snap,allowed:false,directRequested:false,
      }));
      if(current?.sync_hash===hash){out.unchanged++;continue;}
      const editedMs=Date.parse(page.last_edited_time??"");
      const decision=notionFacebookScheduleV2Decision({
        scheduledAt:snap.scheduledAt,imageAvailable:Boolean(snap.image.url),
        notionState:snap.notionState,lastEditedAt:page.last_edited_time,now,
        cutover:policy.cutover,wasScheduled:current?.status==="scheduled",
        currentScheduledAt:current?.scheduled_at,
      });
      // An older Notion snapshot cannot revoke a current scheduled D1 post.
      if(policy.enabled&&current&&!decision.fresh){out.unchanged++;continue;}
      if(current&&current.updated_by!==ACTOR){
        // D1 and Notion are bidirectional only for changes newer than the
        // last local edit. If timestamps are absent/ambiguous, retain D1.
        const localMs=Date.parse(current.updated_at);
        if(!policy.enabled||!Number.isFinite(editedMs)
          ||!Number.isFinite(localMs)||editedMs<=localMs){
          out.unchanged++;continue;
        }
      }
      const image=await imageForPage(bindings,snap.image,current);
      const scheduled=policy.enabled
        ?decision.eligible&&Boolean(image.key)
        :false;
      const targetStatus=scheduled?"scheduled":"draft";
      const targetAt=scheduled?snap.scheduledAt:null;
      if(policy.enabled&&current&&current.title===title&&current.caption===snap.caption
        &&current.image_key===image.key&&current.status===targetStatus
        &&current.scheduled_at===targetAt){
        out.unchanged++;continue;
      }
      const updatedAt=now.toISOString();
      if(!current) {
        const sql="INSERT OR IGNORE INTO facebook_image_posts "+
          "(id,title,image_url,image_key,caption,scheduled_at,status,approval_status,"+
          "approved_at,approved_by,notion_page_id,sync_hash,created_at,updated_at,created_by,updated_by) "+
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        const result=await db.prepare(sql).bind(
          crypto.randomUUID(),title,image.url,image.key,snap.caption,
          targetAt,targetStatus,
          scheduled?"APPROVED":"UNREVIEWED",scheduled?updatedAt:null,scheduled?ACTOR:null,
          page.id,hash,updatedAt,updatedAt,ACTOR,ACTOR,
        ).run();
        if(result.meta.changes===1){
          out.created++;
          if(!policy.enabled&&await mirrorApprovalToNotion(bindings,page,await linked(db,page.id,consentReady)))
            out.writtenBack++;
          if(policy.enabled&&await mirrorV2ScheduleState(bindings,page,scheduled,false,
            null,snap.scheduledAt))out.writtenBack++;
        }else out.conflicts++;
      }else {
        const sql="UPDATE facebook_image_posts SET title=?,image_url=?,image_key=?,caption=?,"+
          "scheduled_at=?,status=?,approval_status=?,approved_at=?,approved_by=?,sync_hash=?,"+
          "version=version+1,updated_at=?,updated_by=? WHERE id=? AND sync_hash=? "+
          (policy.enabled?"AND version=? ":"AND updated_by=? ")+
          "AND status IN ('draft','scheduled') "+(trashReady?"AND deleted_at IS NULL ":"")+
          "AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)";
        const result=await db.prepare(sql).bind(
          title,image.url,image.key,snap.caption,
          targetAt,targetStatus,
          scheduled?"APPROVED":"UNREVIEWED",scheduled?updatedAt:null,scheduled?ACTOR:null,
          hash,updatedAt,ACTOR,current.id,current.sync_hash,
          policy.enabled?current.version:ACTOR,
        ).run();
        if(result.meta.changes===1){
          out.updated++;
          if(policy.enabled&&await mirrorV2ScheduleState(bindings,page,scheduled,
            current.status==="scheduled",current.scheduled_at,snap.scheduledAt))
            out.writtenBack++;
        }else out.conflicts++;
      }
    }catch {
      // Signed Notion file URLs and OAuth/API credentials must never enter logs.
      out.failed++;
    }
  }
  if(policy.enabled)out.adminExport=await exportFacebookAdminChanges({db,bindings,now});
  return out;
}
