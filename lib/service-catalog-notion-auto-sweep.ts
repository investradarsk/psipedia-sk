/**
 * Services V3 / owner-gated hourly auto-sync.
 *
 * Exactly ONE dynamic option per hour. D1 is canonical; Notion is mirror only.
 * Uses the existing privileged executor, registry, receipts and 0124 lease.
 * A durable D1 claim is committed BEFORE any Notion PATCH/POST. A timeout,
 * crash or uncertain response remains quarantined — NEVER automatically retried.
 * No page creation without a distinct second auto-provisioning opt-in.
 */
import {runServicesV3CatalogInternal} from "./service-catalog-notion-internal-runner.ts";

type Config={
  NOTION_API_TOKEN?:string;
  SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;
  SERVICE_CATALOG_NOTION_MIRROR_READY?:string;
  SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED?:string;
  SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED?:string;
  SERVICE_CATALOG_NOTION_AUTO_ENABLED?:string;
  SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED?:string;
};
type Run=typeof runServicesV3CatalogInternal;
type Attempt={option_id:string;option_version:number;action:string};
export type ServicesV3AutoSummary={
  state:"DISABLED"|"BLOCKED"|"IDLE"|"QUARANTINED"|"VERIFIED"|"PAGE_READY";
  reason?:string;
  action?:"PROVISION_ONE"|"MIRROR_ONE";
  optionId?:string;
};
const truth=(v?:string)=>v==="true";
const DYNAMIC=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const key=(id:string,version:number,action:string)=>[id,version,action].join(":");
const iso=(d:Date)=>d.toISOString();

/** Only the existing Cloudflare scheduled Worker invokes this; never a public API. */
export async function runServicesV3CatalogAutoSweep(input:{
  db:D1Database;
  bindings:Config;
  now?:Date;
  run?:Run;
}):Promise<ServicesV3AutoSummary>{
  const {db,bindings}=input;
  if(!bindings||!truth(bindings.SERVICE_CATALOG_NOTION_AUTO_ENABLED))
    return {state:"DISABLED"};
  // No writes if *any* established Admin/Notion guard is absent.
  if(!db?.prepare||!bindings.NOTION_API_TOKEN?.trim()||
    !truth(bindings.SERVICE_CATALOG_ADMIN_WRITES_ENABLED)||
    !truth(bindings.SERVICE_CATALOG_NOTION_MIRROR_READY)||
    !truth(bindings.SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED))
    return {state:"BLOCKED",reason:"RELEASE_GATES_OFF"};
  const allowCreates=truth(bindings.SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED)&&
    truth(bindings.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED);
  const execute=input.run??runServicesV3CatalogInternal;
  const now=input.now??new Date();
  if(!Number.isFinite(now.getTime()))return {state:"BLOCKED",reason:"INVALID_TIME"};
  try{
    // Dedicated 0139 existence/read check. An absent migration blocks before
    // any Notion action, including on an already provisioned page.
    const records=await db.prepare(
      "SELECT option_id,option_version,action FROM service_catalog_notion_auto_attempts ORDER BY option_id,option_version,action LIMIT 10001"
    ).all<Attempt>();
    if(!Array.isArray(records.results)||records.results.length>=10001)
      return {state:"BLOCKED",reason:"ATTEMPT_JOURNAL_UNVERIFIED"};
    const existing=new Set(records.results.map(r=>key(r.option_id,r.option_version,r.action)));
    const inventory=await execute({db,env:bindings,action:"INVENTORY",authorize:async()=>true});
    if(inventory.state!=="INVENTORY"||inventory.value.blocked)
      return {state:"BLOCKED",reason:"INVENTORY_UNVERIFIED"};
    // safeForAutomaticWrite:false is deliberate in the read-only inventory:
    // the inventory never grants write authority. The separate cron flag,
    // one-time D1 claim, exact-option CAS and Notion proof do that.
    const eligible=inventory.value.items
      .filter(item=>DYNAMIC.test(item.optionId)&&Number.isSafeInteger(item.version)&&item.version>=1)
      .map(item=>({
        item, action: item.disposition==="MAPPED_PENDING"
          ? "MIRROR_ONE" as const
          : item.disposition==="NEEDS_PAGE"&&allowCreates
            ? "PROVISION_ONE" as const:null
      }))
      .filter((x):x is {item:typeof inventory.value.items[number];action:"MIRROR_ONE"|"PROVISION_ONE"}=>!!x.action)
      .sort((a,b)=>a.item.optionId.localeCompare(b.item.optionId)||a.action.localeCompare(b.action));
    for(const {item,action} of eligible){
      const optionId=item.optionId;
      const version=item.version;
      if(existing.has(key(optionId,version,action)))continue;
      // D1 primary key arbitrates overlapping cron instances. Recheck the
      // exact DRAFT/PENDING version atomically with the one-shot reservation.
      const claim=await db.prepare(
        "INSERT INTO service_catalog_notion_auto_attempts (option_id,option_version,action,claimed_at) "+
        "SELECT ?1,?2,?3,?4 WHERE EXISTS "+
        "(SELECT 1 FROM service_catalog_admin_options WHERE id=?1 AND version=?2 "+
        "AND status='DRAFT' AND notion_mirror_status='PENDING') "+
        "ON CONFLICT(option_id,option_version,action) DO NOTHING "+
        "RETURNING option_id"
      ).bind(optionId,version,action,iso(now)).first<{option_id:string}>();
      if(!claim)continue;
      let outcome:"CREATED_NEEDS_MIRROR"|"EXISTS"|"VERIFIED"|"RETRY"|"REVIEW"|"BLOCKED"="REVIEW";
      try{
        // No loop or retry. On any ambiguous result the permanent intent remains.
        const result=await execute({db,env:bindings,action,optionId,authorize:async()=>true});
        outcome=result.state==="MIRROR"||result.state==="PROVISION"
          ? result.result.state : "REVIEW";
      }catch{outcome="REVIEW";}
      try{
        await db.prepare(
          "UPDATE service_catalog_notion_auto_attempts SET outcome=?1,finished_at=?2 "+
          "WHERE option_id=?3 AND option_version=?4 AND action=?5 AND outcome='CLAIMED'"
        ).bind(outcome,iso(new Date()),optionId,version,action).run();
      }catch{
        // The durable CLAIMED row already blocks any automatic repeat.
        return {state:"QUARANTINED",reason:"OUTCOME_WRITE_UNVERIFIED",action,optionId};
      }
      return {state:outcome==="VERIFIED"?"VERIFIED"
        : outcome==="CREATED_NEEDS_MIRROR"||outcome==="EXISTS"?"PAGE_READY"
        :"QUARANTINED",...(outcome==="VERIFIED"?{}:{reason:outcome}),action,optionId};
    }
    return {state:"IDLE"};
  }catch{
    return {state:"BLOCKED",reason:"D1_OR_INVENTORY_UNAVAILABLE"};
  }
}
