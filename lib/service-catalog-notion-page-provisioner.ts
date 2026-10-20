/**
 * Optional manual Services V3 D1 -> Notion page provisioning primitive.
 * NO ROUTE, NO CRON, NO PRODUCTION INVOCATION. Never provisions static
 * V0.3 catalog definitions or legacy profile free-text fields.
 *
 * Even after future explicit activation, a create timeout is UNKNOWN.
 * Requires a real durable cross-worker lease. Never auto-retry uncertain POST.
 * Does not write to D1 or claim Notion receipt/synced state.
 */
import {buildServicesV3NotionBootstrapInventory} from "./service-catalog-notion-bootstrap-plan.ts";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port.ts";

type DB=Pick<D1Database,"prepare">;
type Row={id:string;version:number;kind:"service"|"attribute";label:string;
  group_name:string;meaning:string;primary_category:string;categories_json:string;
  value_kind:"tri_state";status:string;notion_mirror_status:string};
type Local={id:string;version:number;kind:Row["kind"];label:string;group:string;meaning:string;
  primaryCategory:string;categories:string[];valueKind:"tri_state"};
type Remote={pageId:string;dataSourceId:string;sourceOptionId:string;sourceOptionVersion:number;
  archived:boolean;inTrash:boolean;fields:{kind:string;label:string;group:string;meaning:string;
    primaryCategory:string;categories:string[];valueKind:string}};
type Mapping={optionId:string;pageId:string;dataSourceId:string};
export type PageProvisionDependencies={
  db:DB;
  flags:{adminWrites?:string;notionMirrorReady?:string;mirrorExecutor?:string;allowPageProvisioning?:string};
  lease:{runExclusive<T>(optionId:string,work:()=>Promise<T>):Promise<T>};
  registry:{list():Promise<Mapping[]>};
  notion:{
    createPage(local:Local):Promise<{pageId:string}>;
    readPage(pageId:string):Promise<Remote>;
  };
};
export type PageProvisionResult={
  optionId:string;
  state:"CREATED_NEEDS_MIRROR"|"EXISTS"|"BLOCKED"|"REVIEW";
  reason?:string;
  pageId?:string;
};
const VALID=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const canon=(id:string)=>id.replaceAll("-","").toLowerCase();
const same=(a:Row,b:Row)=>[
  "id","version","kind","label","group_name","meaning","primary_category","categories_json",
  "value_kind","status","notion_mirror_status"
].every(k=>a[k as keyof Row]===b[k as keyof Row]);
async function snapshot(db:DB,id:string):Promise<Row|null>{
  return db.prepare("SELECT id,version,kind,label,group_name,meaning,primary_category,categories_json,value_kind,status,notion_mirror_status FROM service_catalog_admin_options WHERE id=?1 LIMIT 1")
    .bind(id).first<Row>();
}
function remoteMatches(page:Remote,local:Local,pageId:string){
  const f=page?.fields;
  if(!page||!f||!UUID.test(page.pageId)||!UUID.test(page.dataSourceId)||
     canon(page.pageId)!==canon(pageId)||
     canon(page.dataSourceId)!==canon(PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId)||
     page.sourceOptionId!==local.id||page.sourceOptionVersion!==local.version||
     page.archived||page.inTrash)return false;
  return f.kind===local.kind&&f.label===local.label&&f.group===local.group&&
    f.meaning===local.meaning&&f.primaryCategory===local.primaryCategory&&
    f.valueKind===local.valueKind&&Array.isArray(f.categories)&&
    new Set(f.categories).size===local.categories.length&&
    [...f.categories].sort().join("\u0000")===[...local.categories].sort().join("\u0000");
}
/** Must be called only by a future separately approved internal manual runner. */
export async function provisionServiceCatalogNotionPage(
  deps:PageProvisionDependencies,optionId:string
):Promise<PageProvisionResult>{
  const blocked=(reason:string):PageProvisionResult=>({optionId,state:"BLOCKED",reason});
  const review=(reason:string,pageId?:string):PageProvisionResult=>({optionId,state:"REVIEW",reason,...(pageId?{pageId}:{})});
  if(!VALID.test(optionId))return blocked("INVALID_OPTION_ID");
  if(deps?.flags?.adminWrites!=="true"||deps.flags.notionMirrorReady!=="true"||
     deps.flags.mirrorExecutor!=="true"||deps.flags.allowPageProvisioning!=="true")
    return blocked("FEATURE_DISABLED");
  if(!deps.lease?.runExclusive||!deps.db?.prepare||!deps.registry?.list||
     !deps.notion?.createPage||!deps.notion?.readPage)
    return blocked("TRUSTED_DEPENDENCY_MISSING");
  try{
    return await deps.lease.runExclusive(optionId,async()=>{
      let inventory:Awaited<ReturnType<typeof buildServicesV3NotionBootstrapInventory>>;
      try{inventory=await buildServicesV3NotionBootstrapInventory(deps.db,deps.registry);}
      catch{return blocked("INVENTORY_UNVERIFIED");}
      if(inventory.blocked)return blocked("INVENTORY_CONFLICT");
      const chosen=inventory.items.find(x=>x.optionId===optionId);
      if(!chosen)return blocked("OPTION_NOT_FOUND");
      if(chosen.disposition==="MAPPED_PENDING"||chosen.disposition==="SYNCED_VERIFIED")
        return {optionId,state:"EXISTS",pageId:chosen.pageId};
      if(chosen.disposition!=="NEEDS_PAGE")return blocked("NOT_ELIGIBLE_FOR_PAGE");
      const before=await snapshot(deps.db,optionId);
      if(!before||before.status!=="DRAFT"||before.notion_mirror_status!=="PENDING")
        return blocked("CANONICAL_OPTION_NOT_PENDING");
      const local:Local={
        id:before.id,version:before.version,kind:before.kind,label:before.label,
        group:before.group_name,meaning:before.meaning,
        primaryCategory:before.primary_category,
        categories:JSON.parse(before.categories_json) as string[],valueKind:before.value_kind
      };
      let created:{pageId:string};
      try{created=await deps.notion.createPage(local);}
      catch{return review("CREATE_OUTCOME_UNKNOWN");}
      if(!UUID.test(created?.pageId??""))return review("INVALID_CREATE_ACK");
      let remote:Remote;
      try{remote=await deps.notion.readPage(created.pageId);}
      catch{return review("READBACK_UNAVAILABLE",created.pageId);}
      if(!remoteMatches(remote,local,created.pageId))
        return review("REMOTE_PROOF_MISMATCH",created.pageId);
      const current=await snapshot(deps.db,optionId);
      if(!current||!same(before,current))return review("STALE_CANONICAL_ROW",created.pageId);
      // Notion indexing may lag after creation: never retry a POST if mapping
      // has not yet become visible to the complete read-only registry.
      let mappings:Mapping[];
      try{mappings=await deps.registry.list();}
      catch{return review("OWNERSHIP_READBACK_UNAVAILABLE",created.pageId);}
      const owner=mappings.filter(m=>m.optionId===optionId);
      if(owner.length!==1||canon(owner[0].pageId)!==canon(created.pageId)||
         canon(owner[0].dataSourceId)!==canon(PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId)||
         mappings.some(m=>m.optionId!==optionId&&canon(m.pageId)===canon(created.pageId)))
        return review("OWNERSHIP_PENDING_OR_CONFLICT",created.pageId);
      return {optionId,state:"CREATED_NEEDS_MIRROR",pageId:created.pageId};
    });
  }catch{return review("LEASE_OR_EXECUTION_FAILURE");}
}
