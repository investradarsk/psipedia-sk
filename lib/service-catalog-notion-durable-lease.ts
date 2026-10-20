/**
 * Services V3: durable cross-isolate, no-expiry D1 mutex with owner CAS.
 *
 * Reuses the EXISTING 0124 coordination table to avoid a new production
 * migration. Keys use a fixed, disjoint namespace; Gemini uses bare page UUIDs.
 * This NEVER writes to profile, catalog, audit or receipt tables.
 *
 * Unknown Notion writes / thrown worker errors retain the lock indefinitely
 * until independently reviewed. No automatic expiration/release/retry. An
 * authorized operator must separately investigate and approve recovery.
 *
 * Internal-only dependency: NO route, cron, job, or deployment invokes this.
 */
type DB=Pick<D1Database,"prepare">;
type Done={state?:string};
const DYNAMIC=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const PREFIX="psipedia:services-v3:catalog:";
export class ServiceCatalogLeaseBusy extends Error {
  constructor(){super("SERVICES_V3_OPTION_LOCK_HELD");}
}
export class ServiceCatalogLeaseStateError extends Error {
  constructor(reason:string){super("SERVICES_V3_LEASE_"+reason);}
}
function checkedKey(optionId:string):string{
  if(!DYNAMIC.test(optionId))throw new ServiceCatalogLeaseStateError("INVALID_OPTION_ID");
  return PREFIX+optionId;
}
function canRelease(result:unknown){
  if(!result||typeof result!=="object"||Array.isArray(result))return false;
  const state=(result as Done).state;
  // REVIEW or RETRY may follow an uncertain external POST/PATCH or D1 commit.
  // Leave the durable exclusion in place, even after worker restart.
  return state==="VERIFIED"||state==="CREATED_NEEDS_MIRROR"||
    state==="EXISTS"||state==="BLOCKED";
}
/** No in-process mutex or timeout; SQLite PK insertion serializes workers. */
export function createServicesV3CatalogD1Lease(db:DB){
  if(!db?.prepare)throw new ServiceCatalogLeaseStateError("DATABASE_MISSING");
  return {
    async runExclusive<T>(optionId:string,work:()=>Promise<T>):Promise<T>{
      if(typeof work!=="function")throw new ServiceCatalogLeaseStateError("WORK_MISSING");
      const key=checkedKey(optionId);
      const owner=crypto.randomUUID();
      const acquired=await db.prepare(
        "INSERT OR IGNORE INTO gemini_notion_review_locks (notion_page_id,owner) VALUES (?1,?2)"
      ).bind(key,owner).run();
      if(acquired?.meta?.changes!==1)throw new ServiceCatalogLeaseBusy();
      // Intentionally NO finally. Exceptions and ambiguous results hold the lock.
      const result=await work();
      if(!canRelease(result))return result;
      const released=await db.prepare(
        "DELETE FROM gemini_notion_review_locks WHERE notion_page_id=?1 AND owner=?2"
      ).bind(key,owner).run();
      if(released?.meta?.changes!==1)
        throw new ServiceCatalogLeaseStateError("RELEASE_OWNERSHIP_LOST");
      return result;
    },
  };
}
/** Optional operator-facing READ-ONLY diagnostic; never clears locks. */
export async function inspectServicesV3CatalogLease(db:DB,optionId:string){
  const key=checkedKey(optionId);
  const row=await db.prepare(
    "SELECT notion_page_id,created_at FROM gemini_notion_review_locks WHERE notion_page_id=?1 LIMIT 1"
  ).bind(key).first<{notion_page_id:string;created_at:string}>();
  return {optionId,held:!!row,createdAt:row?.created_at??null};
}
