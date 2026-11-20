/**
 * Reclaim orphaned private R2 chat uploads after an interrupted Worker execution.
 * Never delete a referenced attachment. 24 h grace protects in-flight sends.
 * One small R2 page per existing email cron sweep; cursor persists in D1.
 */
const PREFIX="quarantine/partner-chat/";
const GRACE_MS=24*60*60*1000;
const PAGE_SIZE=100;
export async function sweepPartnerChatOrphans(input:{
  database:D1Database;bucket?:R2Bucket;now?:Date;
}){
  if(!input.bucket)return {scanned:0,deleted:0,skipped:true};
  const db=input.database,storage=input.bucket,now=input.now??new Date();
  const prior=await db.prepare("SELECT cursor FROM partner_chat_orphan_scan_state WHERE singleton=1")
    .first<{cursor:string|null}>();
  const page=await storage.list({
    prefix:PREFIX,cursor:prior?.cursor??undefined,limit:PAGE_SIZE,
  });
  const cutoff=now.getTime()-GRACE_MS;
  const aged=page.objects.filter(o=>o.key.startsWith(PREFIX) &&
    o.uploaded instanceof Date && Number.isFinite(o.uploaded.getTime()) &&
    o.uploaded.getTime()<cutoff);
  const keys=aged.map(o=>o.key);
  let known=new Set<string>();
  if(keys.length){
    const rows=await db.prepare("SELECT private_key AS key FROM partner_chat_attachments WHERE private_key IN ("+
      keys.map(()=>"?").join(",")+")").bind(...keys).all<{key:string}>();
    known=new Set(rows.results.map(r=>r.key));
  }
  let deleted=0;
  for(const item of aged){
    // An error aborts cursor advancement: next sweep safely retries.
    if(!known.has(item.key)){await storage.delete(item.key);deleted++;}
  }
  const next=page.truncated?page.cursor:null;
  if(page.truncated&&!next)throw new Error("Partner chat R2 listing has no continuation cursor.");
  await db.prepare("INSERT INTO partner_chat_orphan_scan_state(singleton,cursor,updated_at) "+
    "VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET "+
    "cursor=excluded.cursor,updated_at=excluded.updated_at")
    .bind(next,now.toISOString()).run();
  return {scanned:page.objects.length,deleted,skipped:false};
}
