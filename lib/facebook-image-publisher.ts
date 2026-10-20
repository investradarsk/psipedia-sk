/** Facebook Page photo publishing, single-attempt fail-closed semantics.
 * No automatic retry is ever allowed after a claim: a transport error might
 * mean Meta published the photo despite an interrupted response.
 * Credentials must be present in Cloudflare secrets (never D1/client/log).
 */
export type FacebookPublisherBindings = {
  FB_PAGE_ID?: string; FB_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_IMAGE_PUBLISH_ENABLED?: string;
  FACEBOOK_IMAGE_SAFE_RETRY_V2_ENABLED?: string;
  BUCKET?:Pick<R2Bucket,"head">;
};
export type PublisherDatabase = Pick<D1Database, "prepare">;
export type PublisherConfig = { enabled: boolean; connected: boolean; technicallyEnabled: boolean };
type Candidate = {
  id: string; image_key: string; caption: string; version: number;
  scheduled_at: string; approval_status: string; retry_count?:number;
};
class ExplicitMetaRateLimitRejection extends Error {
  constructor(){super("META_EXPLICIT_RATE_LIMIT");}
}
export function facebookSafeRetryEnabled(bindings:FacebookPublisherBindings) {
  return ["true","1"].includes((bindings.FACEBOOK_IMAGE_SAFE_RETRY_V2_ENABLED??"").toLowerCase());
}
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
/** Owner-confirmed permission; never publishes by itself.
 * A separate authenticated, replay-safe authorization path will be needed
 * before ChatGPT/direct integrations can consume this flag.
 */
export async function setDirectPublishConsent(db: PublisherDatabase,id:string,expectedVersion:number,
  consent:boolean,actor:string) {
  await requirePublisherSchema(db);
  // The additive migration must exist before a permission may be granted.
  await db.prepare("SELECT direct_publish_consent FROM facebook_image_posts LIMIT 0").all();
  if(!/^[a-f\d-]{36}$/i.test(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw new Error("Neplatná verzia príspevku.");
  const now=clock(new Date());
  const row=await db.prepare(`UPDATE facebook_image_posts SET
      direct_publish_consent=?,direct_consent_at=?,direct_consent_by=?,
      version=version+1,updated_at=?,updated_by=?
      WHERE id=? AND version=? AND status IN ('draft','scheduled')
        AND deleted_at IS NULL AND (image_key<>'' OR ?=0)
        AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a WHERE a.post_id=facebook_image_posts.id)
      RETURNING id,version,direct_publish_consent`)
    .bind(consent?1:0,consent?now:null,consent?actor:null,now,actor,
      id,expectedVersion,consent?1:0).first<{id:string;version:number;direct_publish_consent:number}>();
  if(!row)throw new Error("Súhlas sa nezmenil: príspevok je neaktuálny, odstránený alebo sa už odosiela.");
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
  // Only an explicit Graph API throttling rejection can enter the safe retry
  // queue. An HTTP status alone, timeout or malformed response is ambiguous.
  if(!response.ok){
    if(facebookSafeRetryEnabled(bindings)&&[400,429].includes(response.status)){
      let code:number|null=null;
      try{
        const body=await response.json() as {error?:{code?:unknown}};
        if(typeof body?.error?.code==="number")code=body.error.code;
      }catch{/* do not log provider response */}
      if(code!==null&&[4,17,32,613].includes(code))
        throw new ExplicitMetaRateLimitRejection();
    }
    throw new Error("META_HTTP_"+response.status);
  }
  const json=await response.json() as PhotoResult;
  if(!json || typeof json.id!=="string" || !/^\d+$/.test(json.id)) throw new Error("META_AMBIGUOUS_RESPONSE");
  return typeof json.post_id==="string" && /^\d+_\d+$/.test(json.post_id)?json.post_id:json.id;
}
export async function runFacebookImagePublishSweep({
  db,bindings,now=new Date(),fetcher=fetch,
}: {db:PublisherDatabase;bindings:FacebookPublisherBindings;now?:Date;fetcher?:typeof fetch}):
Promise<{configured:boolean;due:number;claimed:number;published:number;uncertain:number;
  retryable:number;preflightSkipped:number}> {
  const summary={configured:publisherConfigured(bindings),due:0,claimed:0,
    published:0,uncertain:0,retryable:0,preflightSkipped:0};
  if(!summary.configured) return summary;
  const safeRetry=facebookSafeRetryEnabled(bindings);
  if(safeRetry&&!bindings.BUCKET)throw new Error("FACEBOOK_R2_PREFLIGHT_REQUIRED");
  // Missing 0129 never falls back to unguarded external publishing.
  await requirePublisherSchema(db);
  if(safeRetry){
    // A feature flag cannot bypass the additive schema migration.
    await db.prepare("SELECT retry_count,retry_not_before,outcome_kind FROM facebook_image_publish_attempts LIMIT 0").all();
  }
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
           AND approval_status='APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    ORDER BY scheduled_at,id LIMIT ${safeRetry?20:50}`).bind(timestamp).all<Candidate>();
  const retryCandidates=safeRetry?await db.prepare(`SELECT p.id,p.image_key,p.caption,p.version,p.scheduled_at,
      p.approval_status,a.retry_count FROM facebook_image_posts p
      JOIN facebook_image_publish_attempts a ON a.post_id=p.id
      WHERE p.status='scheduled' AND p.scheduled_at<=? AND p.image_key<>''
        ${trashReady?"AND p.deleted_at IS NULL":""}
        AND a.state='UNCERTAIN' AND a.outcome_kind='PROVEN_REJECTED'
        AND a.retry_count<3 AND a.retry_not_before<=?
        AND a.snapshot_version=p.version
        AND (COALESCE((SELECT enabled FROM facebook_image_publisher_settings WHERE id=1),0)=1
          AND p.approval_status='APPROVED' AND p.approved_at IS NOT NULL AND p.approved_by IS NOT NULL)
      ORDER BY a.retry_not_before,p.id LIMIT 10`).bind(timestamp,timestamp).all<Candidate>()
    :{results:[] as Candidate[]};
  const retryIds=new Set(retryCandidates.results.map(p=>p.id));
  summary.due=candidates.results.length+retryCandidates.results.length;
  for(const item of [...retryCandidates.results,...candidates.results]){
    if(safeRetry){
      try{
        const media=await bindings.BUCKET!.head(item.image_key);
        if(!media||!["image/jpeg","image/png","image/webp"].includes(
          media.httpMetadata?.contentType??"")){summary.preflightSkipped++;continue;}
      }catch{summary.preflightSkipped++;continue;}
    }
    // The claim atomically checks global STOP AND per-item approval and version.
    // Competing cron invocations cannot claim the same post twice.
    const isRetry=retryIds.has(item.id);
    const claimed=isRetry?await db.prepare(`UPDATE facebook_image_publish_attempts
        SET state='SENDING',started_at=?,completed_at=NULL,error_code=NULL,
          outcome_kind='UNKNOWN',retry_not_before=NULL,retry_count=retry_count+1
        WHERE post_id=? AND state='UNCERTAIN' AND outcome_kind='PROVEN_REJECTED'
          AND retry_count<3 AND retry_not_before<=?
          AND EXISTS (SELECT 1 FROM facebook_image_posts p
            WHERE p.id=facebook_image_publish_attempts.post_id
              AND p.version=facebook_image_publish_attempts.snapshot_version
              AND p.status='scheduled' AND p.scheduled_at<=? AND p.image_key=?
              ${trashReady?"AND p.deleted_at IS NULL":""}
              AND (COALESCE((SELECT enabled FROM facebook_image_publisher_settings WHERE id=1),0)=1
                AND p.approval_status='APPROVED' AND p.approved_at IS NOT NULL
                AND p.approved_by IS NOT NULL))
        RETURNING post_id`).bind(timestamp,item.id,timestamp,timestamp,item.image_key).first<{post_id:string}>()
      :await db.prepare(`INSERT OR IGNORE INTO facebook_image_publish_attempts
       (post_id,snapshot_version,state,started_at)
       SELECT id,version,'SENDING',? FROM facebook_image_posts WHERE id=? AND version=?
         AND status='scheduled' AND scheduled_at<=? AND image_key=? ${trashReady?"AND deleted_at IS NULL":""}
         AND (COALESCE((SELECT enabled FROM facebook_image_publisher_settings WHERE id=1),0)=1
           AND approval_status='APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
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
      if(isRetry){
        await db.prepare(`UPDATE facebook_image_publish_attempts
          SET state='UNCERTAIN',outcome_kind='PROVEN_REJECTED',
            retry_count=retry_count-1,retry_not_before=?,error_code='META_RATE_LIMIT'
          WHERE post_id=? AND state='SENDING'`).bind(timestamp,item.id).run();
      }else{
        await db.prepare("DELETE FROM facebook_image_publish_attempts WHERE post_id=? AND state='SENDING'")
          .bind(item.id).run();
      }
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
      if(safeRetry&&error instanceof ExplicitMetaRateLimitRejection){
        const count=(item.retry_count??0)+(isRetry?1:0);
        const delayMs=Math.min(30*60000,60000*Math.pow(2,count));
        const eligible=count<3?new Date(now.getTime()+delayMs).toISOString():null;
        await db.prepare(`UPDATE facebook_image_publish_attempts
          SET state='UNCERTAIN',completed_at=?,error_code=?,
            outcome_kind='PROVEN_REJECTED',retry_not_before=?
          WHERE post_id=? AND state='SENDING'`)
          .bind(clock(new Date()),eligible?"META_RATE_LIMIT":"META_RATE_LIMIT_EXHAUSTED",
            eligible,item.id).run();
        summary.retryable++;
      }else{
        // Timeouts, interrupted transport, 5xx and unknown Meta responses
        // always remain permanently UNCERTAIN until trusted reconciliation.
        if(safeRetry){
          await db.prepare(`UPDATE facebook_image_publish_attempts
            SET state='UNCERTAIN',completed_at=?,error_code=?,outcome_kind='AMBIGUOUS'
            WHERE post_id=? AND state='SENDING'`)
            .bind(clock(new Date()),code,item.id).run();
        }else{
          await db.prepare("UPDATE facebook_image_publish_attempts SET state='UNCERTAIN',completed_at=?,error_code=? WHERE post_id=? AND state='SENDING'")
            .bind(clock(new Date()),code,item.id).run();
        }
        summary.uncertain++;
      }
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
