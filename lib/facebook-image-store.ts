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
type Row = {id:string;title:string;image_url:string;image_key:string;caption:string;scheduled_at:string|null;status:FacebookImagePost["status"];version:number;created_at:string;updated_at:string};
function post(row: Row): FacebookImagePost { return {id:row.id,title:row.title,imageUrl:row.image_url,imageKey:row.image_key,caption:row.caption,scheduledAt:row.scheduled_at,status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}; }
const columns = "id,title,image_url,image_key,caption,scheduled_at,status,version,created_at,updated_at";
export async function getFacebookImagePost(id:string, db=facebookImageDb()) {
  await requireFacebookImageSchema(db);
  const row=await db.prepare(`SELECT ${columns} FROM facebook_image_posts WHERE id=?`).bind(id).first<Row>();
  return row ? post(row) : null;
}
export async function listFacebookImagePosts(month:string,status:string,page=1,db=facebookImageDb()) {
  await requireFacebookImageSchema(db);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Neplatný mesiac.");
  if (!["all","draft","scheduled","published"].includes(status)) throw new Error("Neplatný filter.");
  const start=new Date(`${month}-01T00:00:00Z`); const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  // UTC safety margin covers both Bratislava offsets at month edges.
  const from=new Date(start.getTime()-8*86400000).toISOString(), to=new Date(end.getTime()+8*86400000).toISOString();
  const condition=status==="all"?"1=1":"status=?", values=status==="all"?[]:[status];
  const total=await db.prepare(`SELECT COUNT(*) AS n FROM facebook_image_posts WHERE ${condition}`).bind(...values).first<{n:number}>();
  const pages=Math.max(1,Math.ceil((total?.n??0)/50));const current=Math.min(Math.max(1,Math.trunc(page)||1),pages);
  const items=await db.prepare(`SELECT ${columns} FROM facebook_image_posts WHERE ${condition} ORDER BY updated_at DESC,id ASC LIMIT 50 OFFSET ?`).bind(...values,(current-1)*50).all<Row>();
  const calendar=await db.prepare(`SELECT ${columns.replace("caption", "'' AS caption")} FROM facebook_image_posts WHERE ${condition} AND scheduled_at>=? AND scheduled_at<? ORDER BY scheduled_at,id`).bind(...values,from,to).all<Row>();
  return {items:items.results.map(post),calendar:calendar.results.map(post),page:current,pages,total:total?.n??0};
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
  if(id){
    const expected=(raw as {expectedVersion?:unknown}).expectedVersion;
    if (!Number.isSafeInteger(expected) || Number(expected)<1)throw new FacebookImageConflict();
    const row=await db.prepare(`UPDATE facebook_image_posts SET title=?,image_url=?,image_key=?,caption=?,scheduled_at=?,status=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND status IN ('draft','scheduled') RETURNING ${columns}`)
      .bind(input.title,input.imageUrl,input.imageKey,input.caption,input.scheduledAt,input.status,now,actor,id,expected).first<Row>();
    if(!row)throw new FacebookImageConflict();return post(row);
  }
  const row=await db.prepare(`INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,1,?,?,?,?) RETURNING ${columns}`)
    .bind(crypto.randomUUID(),input.title,input.imageUrl,input.imageKey,input.caption,input.scheduledAt,input.status,now,now,actor,actor).first<Row>();
  if(!row)throw new Error("Príspevok sa nepodarilo uložiť.");return post(row);
}
