import {env} from "cloudflare:workers";
import {normalizeFacebookImageInput, type FacebookImagePost, type FacebookImageInput} from "@/lib/facebook-image-post";
export class FacebookImageSchemaUnavailable extends Error {
  constructor() { super("Modul čaká na schválenú D1 migráciu 0128. Žiadne údaje sa nezapisujú."); }
}
export class FacebookImageConflict extends Error { constructor() { super("Príspevok sa medzičasom zmenil. Zavri editor a načítaj aktuálne údaje; skopíruj si neuložený text."); } }
export function facebookImageDb() { const db = (env as unknown as {DB?: D1Database}).DB; if (!db) throw new FacebookImageSchemaUnavailable(); return db; }
export async function requireFacebookImageSchema(db: D1Database) {
  try { await db.prepare("SELECT id,title,image_url,image_key,caption,scheduled_at,status,version,created_at,updated_at,created_by,updated_by FROM facebook_image_posts LIMIT 0").all(); }
  catch { throw new FacebookImageSchemaUnavailable(); }
}
type Row = {id:string;title:string;image_url:string;image_key:string;caption:string;
  scheduled_at:string|null;status:FacebookImagePost["status"];version:number;created_at:string;
  updated_at:string;approval_status:string;attempt_state?:string|null;error_code?:string|null;
  facebook_post_id?:string|null;published_at?:string|null;notion_page_id?:string|null;
  approved_at?:string|null;approved_by?:string|null;attempt_started_at?:string|null;
  direct_publish_consent?:number;direct_consent_at?:string|null;direct_consent_by?:string|null;
  attempt_completed_at?:string|null;deleted_at?:string|null;deleted_by?:string|null;
};
function post(row:Row):FacebookImagePost {
  return {id:row.id,title:row.title,imageUrl:row.image_url,imageKey:row.image_key,
    caption:row.caption,scheduledAt:row.scheduled_at,status:row.status,version:row.version,
    createdAt:row.created_at,updatedAt:row.updated_at,approvalStatus:row.approval_status,
    publicationState:row.attempt_state??"PENDING",publicationError:row.error_code??null,
    facebookPostId:row.facebook_post_id??null,publishedAt:row.published_at??null,
    source:row.notion_page_id?"notion":"manual",notionPageId:row.notion_page_id??null,
    approvedAt:row.approved_at??null,approvedBy:row.approved_by??null,
    attemptStartedAt:row.attempt_started_at??null,
    attemptCompletedAt:row.attempt_completed_at??null,
    deletedAt:row.deleted_at??null,deletedBy:row.deleted_by??null,
    directPublishConsent:row.direct_publish_consent===1,
    directConsentAt:row.direct_consent_at??null,directConsentBy:row.direct_consent_by??null};
}
const columns="id,title,image_url,image_key,caption,scheduled_at,status,version,created_at,updated_at,approval_status,facebook_post_id,published_at,notion_page_id,approved_at,approved_by";
async function hasPublisherSchema(db:D1Database) {
  try {await db.prepare("SELECT post_id,state,error_code FROM facebook_image_publish_attempts LIMIT 0").all();return true;}
  catch(error) {
    if(error instanceof Error && /no such table:\s*facebook_image_publish_attempts|table.*facebook_image_publish_attempts.*does not exist/i.test(error.message))return false;
    throw error;
  }
}
async function hasTrashSchema(db:D1Database) {
  try {await db.prepare("SELECT deleted_at,deleted_by FROM facebook_image_posts LIMIT 0").all();return true;}
  catch(error) {
    if(error instanceof Error && /no such column:\s*deleted_at|no such column:\s*deleted_by/i.test(error.message))return false;
    throw error;
  }
}
async function hasDirectConsentSchema(db:D1Database) {
  try {await db.prepare("SELECT direct_publish_consent,direct_consent_at,direct_consent_by FROM facebook_image_posts LIMIT 0").all();return true;}
  catch(error) {
    if(error instanceof Error && /no such column:\\s*direct_(publish_consent|consent_at|consent_by)/i.test(error.message))return false;
    throw error;
  }
}
function selectColumns(publisher:boolean,trash:boolean,consent:boolean) {
  const base=columns.split(",").map(name=>"p."+name).join(",");
  return base+","+(publisher?"a.state":"NULL")+" AS attempt_state,"+
    (publisher?"a.error_code":"NULL")+" AS error_code,"+
    (publisher?"a.started_at":"NULL")+" AS attempt_started_at,"+
    (publisher?"a.completed_at":"NULL")+" AS attempt_completed_at,"+
    (trash?"p.deleted_at":"NULL")+" AS deleted_at,"+
    (trash?"p.deleted_by":"NULL")+" AS deleted_by,"+
    (consent?"p.direct_publish_consent":"0")+" AS direct_publish_consent,"+
    (consent?"p.direct_consent_at":"NULL")+" AS direct_consent_at,"+
    (consent?"p.direct_consent_by":"NULL")+" AS direct_consent_by";
}
function publisherJoin(publisher:boolean) {
  return publisher?" LEFT JOIN facebook_image_publish_attempts a ON a.post_id=p.id":"";
}
export async function getFacebookImagePost(id:string,db=facebookImageDb()) {
  await requireFacebookImageSchema(db);
  const publisher=await hasPublisherSchema(db),trash=await hasTrashSchema(db),consent=await hasDirectConsentSchema(db);
  const row=await db.prepare(`SELECT ${selectColumns(publisher,trash,consent)}
    FROM facebook_image_posts p${publisherJoin(publisher)} WHERE p.id=?`).bind(id).first<Row>();
  return row?post(row):null;
}
export async function listFacebookImagePosts(
  month:string,status:string,page=1,db=facebookImageDb(),source="all",
) {
  await requireFacebookImageSchema(db);
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw new Error("Neplatný mesiac.");
  if(!["all","draft","scheduled","published","sending","review"].includes(status))
    throw new Error("Neplatný filter.");
  if(!["all","manual","notion"].includes(source))throw new Error("Neplatný zdroj.");
  const publisher=await hasPublisherSchema(db),trash=await hasTrashSchema(db),consent=await hasDirectConsentSchema(db);
  const start=new Date(month+"-01T00:00:00Z"),end=new Date(start);
  end.setUTCMonth(end.getUTCMonth()+1);
  const from=new Date(start.getTime()-8*86400000).toISOString();
  const to=new Date(end.getTime()+8*86400000).toISOString();
  const where:string[]=[],values:string[]=[];
  if(trash)where.push("p.deleted_at IS NULL");
  if(["draft","scheduled","published"].includes(status)){
    where.push("p.status=?");values.push(status);
  }
  if(status==="sending"||status==="review"){
    where.push(publisher?"a.state=?":"1=0");
    if(publisher)values.push(status==="sending"?"SENDING":"UNCERTAIN");
  }
  if(source==="notion")where.push("p.notion_page_id IS NOT NULL");
  else if(source==="manual")where.push("p.notion_page_id IS NULL");
  const clause=where.length?where.join(" AND "):"1=1";
  const join=publisherJoin(publisher),select=selectColumns(publisher,trash,consent);
  const totalRow=await db.prepare("SELECT COUNT(*) AS n FROM facebook_image_posts p"+join+
    " WHERE "+clause).bind(...values).first<{n:number}>();
  const total=totalRow?.n??0,pages=Math.max(1,Math.ceil(total/50));
  const current=Math.min(Math.max(1,Math.trunc(page)||1),pages);
  const items=await db.prepare("SELECT "+select+" FROM facebook_image_posts p"+join+
    " WHERE "+clause+" ORDER BY p.updated_at DESC,p.id ASC LIMIT 50 OFFSET ?")
    .bind(...values,(current-1)*50).all<Row>();
  const calendar=await db.prepare("SELECT "+select+" FROM facebook_image_posts p"+join+
    " WHERE "+clause+" AND p.scheduled_at>=? AND p.scheduled_at<? ORDER BY p.scheduled_at,p.id")
    .bind(...values,from,to).all<Row>();
  const active=trash?"p.deleted_at IS NULL":"1=1";
  const sum=(expr:string)=>"COALESCE(SUM(CASE WHEN "+expr+" THEN 1 ELSE 0 END),0)";
  const aggregate=await db.prepare("SELECT "+
    sum(active+" AND p.status='draft'")+" AS draft,"+
    sum(active+" AND p.status='scheduled'")+" AS scheduled,"+
    sum(active+" AND p.status='published'")+" AS published,"+
    sum(active+(publisher?" AND a.state='SENDING'":" AND 1=0"))+" AS sending,"+
    sum(active+(publisher?" AND a.state='UNCERTAIN'":" AND 1=0"))+" AS review,"+
    sum(trash?"p.deleted_at IS NOT NULL":"1=0")+" AS trash "+
    "FROM facebook_image_posts p"+join).first<Record<string,number>>();
  return {items:items.results.map(post),calendar:calendar.results.map(post),
    page:current,pages,total,counts:aggregate??{draft:0,scheduled:0,published:0,sending:0,review:0,trash:0},
    trashAvailable:trash};
}
async function verifyImage(input:FacebookImageInput) {
  if (!input.imageKey) return;
  const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
  if (!bucket) throw new Error("Úložisko obrázkov nie je dostupné.");
  const object=await bucket.head(input.imageKey);
  if (!object || !["image/jpeg","image/png","image/webp"].includes(object.httpMetadata?.contentType??"")) throw new Error("Uložený obrázok sa v úložisku nenašiel.");
}
export async function saveFacebookImagePost(id:string|null,raw:unknown,actor:string,db=facebookImageDb()) {
  await requireFacebookImageSchema(db);
  const input=normalizeFacebookImageInput(raw);await verifyImage(input);
  const now=new Date().toISOString();
  const publisher=await hasPublisherSchema(db),consent=await hasDirectConsentSchema(db);
  if(id){
    const expected=(raw as {expectedVersion?:unknown}).expectedVersion;
    if (!Number.isSafeInteger(expected) || Number(expected)<1)throw new FacebookImageConflict();
    const row=await db.prepare(`UPDATE facebook_image_posts SET title=?,image_url=?,image_key=?,caption=?,scheduled_at=?,status=?,approval_status='UNREVIEWED',approved_at=NULL,approved_by=NULL,${consent?"direct_publish_consent=0,direct_consent_at=NULL,direct_consent_by=NULL,":""}version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND status IN ('draft','scheduled') ${await hasTrashSchema(db)?"AND deleted_at IS NULL ":""}${publisher?"AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)":""} RETURNING ${columns}`)
      .bind(input.title,input.imageUrl,input.imageKey,input.caption,input.scheduledAt,input.status,now,actor,id,expected).first<Row>();
    if(!row)throw new FacebookImageConflict();return post(row);
  }
  const row=await db.prepare(`INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,1,?,?,?,?) RETURNING ${columns}`)
    .bind(crypto.randomUUID(),input.title,input.imageUrl,input.imageKey,input.caption,input.scheduledAt,input.status,now,now,actor,actor).first<Row>();
  if(!row)throw new Error("Príspevok sa nepodarilo uložiť.");return post(row);
}
