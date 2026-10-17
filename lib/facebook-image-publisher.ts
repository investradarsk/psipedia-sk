/** Facebook Page photo publishing, single-attempt fail-closed semantics.
 * No automatic retry is ever allowed after a claim: a transport error might
 * mean Meta published the photo despite an interrupted response.
 * Credentials must be present in Cloudflare secrets (never D1/client/log).
 */
export type FacebookPublisherBindings = {
  FB_PAGE_ID?: string; FB_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_IMAGE_PUBLISH_ENABLED?: string;
};
export type PublisherDatabase = Pick<D1Database, "prepare">;
export type PublisherConfig = { enabled: boolean; connected: boolean; technicallyEnabled: boolean };
type Candidate = {
  id: string; image_key: string; caption: string; version: number;
  scheduled_at: string; approval_status: string;
};
type PhotoResult = { id?: string; post_id?: string };
const clock = (when: Date) => when.toISOString();
export function publisherConfigured(bindings: FacebookPublisherBindings) {
  return Boolean(/^\d{5,30}$/.test(bindings.FB_PAGE_ID ?? "")
    && (bindings.FB_PAGE_ACCESS_TOKEN ?? "").length > 20
    && ["true","1"].includes((bindings.FACEBOOK_IMAGE_PUBLISH_ENABLED ?? "").toLowerCase()));
}
export async function requirePublisherSchema(db: PublisherDatabase) {
  await db.prepare("SELECT id,enabled FROM facebook_image_publisher_settings LIMIT 0").all();
  await db.prepare("SELECT post_id,state FROM facebook_image_publish_attempts LIMIT 0").all();
}
export async function publisherConfig(db: PublisherDatabase, bindings: FacebookPublisherBindings): Promise<PublisherConfig> {
  await requirePublisherSchema(db);
  const setting = await db.prepare("SELECT enabled FROM facebook_image_publisher_settings WHERE id=1").first<{enabled:number}>();
  return {enabled:setting?.enabled===1,connected:Boolean(bindings.FB_PAGE_ID && bindings.FB_PAGE_ACCESS_TOKEN),
    technicallyEnabled:publisherConfigured(bindings)};
}
export async function setPublisherEnabled(db: PublisherDatabase, enabled: boolean, actor: string) {
  await requirePublisherSchema(db);
  const now=clock(new Date());
  await db.prepare("INSERT INTO facebook_image_publisher_settings(id,enabled,updated_at,updated_by) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
    .bind(enabled?1:0,now,actor).run();
}
export async function setIndividualApproval(db: PublisherDatabase, id: string, expectedVersion: number, approved: boolean, actor: string) {
  await requirePublisherSchema(db);
  if(!/^[a-f\d-]{36}$/i.test(id) || !Number.isSafeInteger(expectedVersion)||expectedVersion<1) throw new Error("Neplatná verzia príspevku.");
  const now=clock(new Date());
  let trashReady=false;
  try {await db.prepare("SELECT deleted_at FROM facebook_image_posts LIMIT 0").all();trashReady=true;}
  catch(error) {if(!(error instanceof Error && /no such column:\s*deleted_at/i.test(error.message)))throw error;}
  const row=await db.prepare(`UPDATE facebook_image_posts
     SET approval_status=?,approved_at=?,approved_by=?,version=version+1,updated_at=?,updated_by=?
     WHERE id=? AND version=? AND status='scheduled' ${trashReady?"AND deleted_at IS NULL":""}
       AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)
     RETURNING id,version,approval_status`).bind(
      approved?"APPROVED":"UNREVIEWED",approved?now:null,approved?actor:null,now,actor,id,expectedVersion
    ).first<{id:string;version:number;approval_status:string}>();
  if(!row) throw new Error("Príspevok sa zmenil, nie je naplánovaný alebo sa už odosiela. Obnov údaje.");
  return row;
}
export async function publishPhotoToMeta(photo: { imageKey:string; caption:string }, bindings: FacebookPublisherBindings,
  fetcher: typeof fetch = fetch): Promise<string> {
  if (!publisherConfigured(bindings)) throw new Error("FACEBOOK_NOT_CONFIGURED");
  if (!/^facebook-images\/\d{4}\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo.imageKey)) throw new Error("IMAGE_KEY_INVALID");
  const body = new URLSearchParams({
    url: `https://psipedia.sk/media/${photo.imageKey}`,
    caption: photo.caption,
    published: "true",
  });
  const response = await fetcher(`https://graph.facebook.com/v26.0/${bindings.FB_PAGE_ID}/photos`,{
    method:"POST",
    headers:{"authorization":`Bearer ${bindings.FB_PAGE_ACCESS_TOKEN}`,"content-type":"application/x-www-form-urlencoded"},
    body:body.toString(),
    signal:AbortSignal.timeout(20000),
  });
  // NEVER log response contents: Meta errors may echo bearer credentials.
  if(!response.ok) throw new Error("META_HTTP_"+response.status);
  const json=await response.json() as PhotoResult;
  if(!json || typeof json.id!=="string" || !/^\d+$/.test(json.id)) throw new Error("META_AMBIGUOUS_RESPONSE");
  return typeof json.post_id==="string" && /^\d+_\d+$/.test(json.post_id)?json.post_id:json.id;
}
export async function runFacebookImagePublishSweep({
  db,bindings,now=new Date(),fetcher=fetch,
}: {db:PublisherDatabase;bindings:FacebookPublisherBindings;now?:Date;fetcher?:typeof fetch}):
Promise<{configured:boolean;due:number;claimed:number;published:number;uncertain:number}> {
  const summary={configured:publisherConfigured(bindings),due:0,claimed:0,published:0,uncertain:0};
  if(!summary.configured) return summary;
  // Missing 0129 never falls back to unguarded external publishing.
  await requirePublisherSchema(db);
  // Soft-delete migration is additive; deleted posts never enter the publishing queue.
  let trashReady=false;
  try {await db.prepare("SELECT deleted_at FROM facebook_image_posts LIMIT 0").all();trashReady=true;}
  catch(error) {
    if(!(error instanceof Error && /no such column:\s*deleted_at/i.test(error.message)))throw error;
  }
  const timestamp=clock(now);
  // Recover a successful Graph response that was already recorded before a
  // subsequent metadata write failed. Never issue another Meta request.
  await db.prepare(`UPDATE facebook_image_posts SET status='published',
      facebook_post_id=(SELECT a.remote_id FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id),
      published_at=(SELECT a.completed_at FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id),
      updated_at=?,updated_by='facebook-image-publisher-reconcile',version=version+1
      WHERE status='scheduled'
      AND EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id AND a.state='PUBLISHED' AND a.remote_id IS NOT NULL)`)
      .bind(timestamp).run();
  const candidates=await db.prepare(`SELECT id,image_key,caption,version,scheduled_at,approval_status FROM facebook_image_posts
    WHERE status='scheduled' AND scheduled_at<=? AND image_key<>'' ${trashReady?"AND deleted_at IS NULL":""}
      AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)
      AND (COALESCE((SELECT enabled FROM facebook_image_publisher_settings WHERE id=1),0)=1
           AND approval_status='APPROVED')
    ORDER BY scheduled_at,id LIMIT 50`).bind(timestamp).all<Candidate>();
  summary.due=candidates.results.length;
  for(const item of candidates.results){
    // The claim atomically checks global STOP AND per-item approval and version.
    // Competing cron invocations cannot claim the same post twice.
    const claimed=await db.prepare(`INSERT OR IGNORE INTO facebook_image_publish_attempts
       (post_id,snapshot_version,state,started_at)
       SELECT id,version,'SENDING',? FROM facebook_image_posts WHERE id=? AND version=?
         AND status='scheduled' AND scheduled_at<=? AND image_key=? ${trashReady?"AND deleted_at IS NULL":""}
         AND (COALESCE((SELECT enabled FROM facebook_image_publisher_settings WHERE id=1),0)=1
           AND approval_status='APPROVED')
         AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)
       RETURNING post_id`).bind(timestamp,item.id,item.version,timestamp,item.image_key).first<{post_id:string}>();
    if(!claimed)continue;
    summary.claimed++;
    // Best-effort race guard directly before entering the external request.
    // If STOP was toggled after the SQL claim, remove ONLY our unsubmitted
    // attempt: it has never left this invocation and is safe to reschedule.
    // Once Meta POST starts it cannot be cancelled reliably.
    const gate=await db.prepare("SELECT enabled FROM facebook_image_publisher_settings WHERE id=1")
      .first<{enabled:number}>();
    if(gate?.enabled!==1){
      await db.prepare("DELETE FROM facebook_image_publish_attempts WHERE post_id=? AND state='SENDING'")
        .bind(item.id).run();
      continue;
    }
    let remote:string;
    try {
      remote=await publishPhotoToMeta({imageKey:item.image_key,caption:item.caption},bindings,fetcher);
    }catch(error){
      const message=error instanceof Error ? error.message : "";
      // Never persist arbitrary exception text: runtimes/providers may echo tokens.
      const code=/^META_HTTP_[0-9]{3}$/.test(message)?message:
        ["META_AMBIGUOUS_RESPONSE","IMAGE_KEY_INVALID","FACEBOOK_NOT_CONFIGURED"].includes(message)?message:"TRANSPORT_OR_UNKNOWN";
      // Safe as well for HTTP errors: Meta may have acted despite a failed response.
      await db.prepare("UPDATE facebook_image_publish_attempts SET state='UNCERTAIN',completed_at=?,error_code=? WHERE post_id=? AND state='SENDING'")
        .bind(clock(new Date()),code,item.id).run();
      summary.uncertain++;
      continue;
    }
    const done=clock(new Date());
    // Metadata first: a failed DB write leaves SENDING; no automatic retry.
    // If the second write fails, a later sweep reconciles from the saved Meta ID.
    await db.prepare("UPDATE facebook_image_publish_attempts SET state='PUBLISHED',remote_id=?,completed_at=? WHERE post_id=? AND state='SENDING'")
      .bind(remote,done,item.id).run();
    await db.prepare(`UPDATE facebook_image_posts SET status='published',facebook_post_id=?,published_at=?,version=version+1,updated_at=?,updated_by='facebook-image-publisher' WHERE id=? AND status='scheduled'
      AND EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id AND a.state='PUBLISHED')`)
      .bind(remote,done,done,item.id).run();
    summary.published++;
  }
  return summary;
}
