import {
  isRecordKind, lifecycleSchemaReady, removeRecord,
  type LifecycleBindings, type RecordKind,
} from "./admin-record-lifecycle";

/**
 * Reconcile only owner-confirmed tombstones. Five-minute Cloudflare cron reuses
 * the existing schedule: no new queue, infrastructure or browser retry needed.
 * Each attempt is CAS-leased and backs off exponentially. An unsafe foreign
 * key/review/partner dependency remains blocked until explicitly resolved.
 */
type RetryRow = {
  kind:string; record_id:number; record_slug:string; record_name:string;
  record_category:string; created_by:string; updated_at:string;
  state:string; error_code:string|null; attempts:number;
};
export function lifecycleRetryDue(updatedAt:string,attempts:number,now:number) {
  const last=Date.parse(updatedAt);
  if(!Number.isFinite(last) || !Number.isFinite(now) ||
    !Number.isSafeInteger(attempts) || attempts<0)return false;
  const wait=Math.min(86_400_000,300_000*(2**Math.min(8,attempts)));
  return last+wait<=now;
}

export async function runRecordLifecycleRetrySweep(input:{
  database:D1Database;bindings:LifecycleBindings;now?:Date;limit?:number;
  apply?:typeof removeRecord;
}) {
  const {database,bindings}=input;
  const now=input.now??new Date();
  if(!await lifecycleSchemaReady(database))return {enabled:false,scanned:0,claimed:0,completed:0,pending:0,errors:0};
  const limit=Math.max(1,Math.min(3,Math.trunc(input.limit??2)));
  const eligible=await database.prepare(
    "SELECT kind,record_id,record_slug,record_name,record_category,created_by,updated_at,state,error_code,attempts "+
    "FROM admin_record_tombstones WHERE state IN ('PENDING_NOTION','ERROR_NOTION','READY_LOCAL') "+
    "AND (error_code IS NULL OR error_code<>'D1_DELETE_BLOCKED_BY_REFERENCES') "+
    "AND updated_at<=? ORDER BY updated_at ASC LIMIT 30"
  ).bind(new Date(now.getTime()-300_000).toISOString()).all<RetryRow>();
  let claimed=0,completed=0,pending=0,errors=0;
  const apply=input.apply??removeRecord;
  for(const row of eligible.results??[]) {
    if(claimed>=limit)break;
    if(!isRecordKind(row.kind) || !Number.isSafeInteger(row.record_id) ||
      row.record_id<=0 || !row.record_slug || !row.record_name ||
      !row.record_category || !row.created_by ||
      !lifecycleRetryDue(row.updated_at,row.attempts,now.getTime()))continue;
    // CAS lease: do not race interactive deletion, webhook or another cron.
    const lease=await database.prepare(
      "UPDATE admin_record_tombstones SET attempts=attempts+1,updated_at=? "+
      "WHERE kind=? AND record_id=? AND state=? AND updated_at=? "+
      "AND (error_code IS NULL OR error_code<>'D1_DELETE_BLOCKED_BY_REFERENCES') "+
      "RETURNING record_id"
    ).bind(now.toISOString(),row.kind,row.record_id,row.state,row.updated_at)
      .first<{record_id:number}>();
    if(lease?.record_id!==row.record_id)continue;
    claimed++;
    try {
      const result=await apply(database,bindings,row.kind as RecordKind,row.record_id,
        row.created_by,false,{
          slug:row.record_slug,name:row.record_name,category:row.record_category,
        });
      if(result.state==="COMPLETE")completed++;
      else pending++;
    }catch(error) {
      errors++;
      console.error("LIFECYCLE_DELETE_RETRY_FAILED",{kind:row.kind,id:row.record_id,
        code:error instanceof Error && /^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)
          ? error.message:"RETRY_FAILED"});
    }
  }
  return {enabled:true,scanned:eligible.results?.length??0,claimed,completed,pending,errors};
}
