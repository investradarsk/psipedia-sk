/**
 * Services V3 catalog bootstrap INVENTORY ONLY. No Notion create/update calls,
 * no D1 writes, no Admin route, no implicit promotion or public profile change.
 *
 * Only dynamic svc.admin.* / attr.admin.* options are D1 rows. The 91 built-in
 * services and 28 static attribute definitions live in the V0.3 code contract;
 * do NOT fabricate dynamic IDs/pages or migrate legacy profile free text.
 */
import {requireServiceCatalogAuditSchema} from "./service-catalog-admin-store.ts";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port.ts";

type DB = Pick<D1Database,"prepare">;
type Row = {
  id:string;kind:string;label:string;group_name:string;meaning:string;
  primary_category:string;categories_json:string;value_kind:string;
  version:number;status:string;notion_mirror_status:string;
};
type Receipt = {option_id:string;option_version:number;notion_page_id:string};
type Mapping = {optionId:string;pageId:string;dataSourceId:string};
type Registry = {list():Promise<Mapping[]>};
export type BootstrapItem = {
  optionId:string;version:number;
  disposition:"NEEDS_PAGE"|"MAPPED_PENDING"|"SYNCED_VERIFIED"|"BLOCKED";
  reason?:string;pageId?:string;
};
export type CatalogBootstrapInventory = {
  mode:"READ_ONLY";
  dataSourceId:string;
  canonicalDynamicCount:number;
  notionPageCount:number;
  receiptCount:number;
  safeForAutomaticWrite:false;
  blocked:boolean;
  items:BootstrapItem[];
  unmappedNotionOptionIds:string[];
};
const idPattern=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const canonicalSource=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
const normalUuid=(s:string)=>s.replaceAll("-","").toLowerCase();
const validOptions=new Set(["veterinari","treneri","kynologicke-kluby",
  "chovatelske-kluby","chovatelske-stanice","salony-a-sluzby",
  "hotely-a-opatrovanie","vencenie","fyzioterapia","dalsie-sluzby"]);
const fail=(reason:string):never=>{throw new Error("CATALOG_BOOTSTRAP_"+reason);};

function checkCanonicalOption(row:Row):boolean {
  let cats:unknown;
  try{cats=JSON.parse(row.categories_json);}catch{return false;}
  return idPattern.test(row.id) &&
    (row.kind==="service" ? row.id.startsWith("svc.") :
      row.kind==="attribute" && row.id.startsWith("attr.")) &&
    Number.isSafeInteger(row.version) && row.version>=1 &&
    typeof row.label==="string" && row.label.trim().length>=3 &&
    typeof row.group_name==="string" && !!row.group_name.trim() &&
    typeof row.meaning==="string" && !!row.meaning.trim() &&
    typeof row.primary_category==="string" && validOptions.has(row.primary_category) &&
    Array.isArray(cats) && cats.length>=1 &&
    cats.every(c=>typeof c==="string" && validOptions.has(c)) &&
    new Set(cats).size===cats.length && cats.includes(row.primary_category) &&
    row.value_kind==="tri_state" &&
    ["DRAFT","ACTIVE","RETIRED"].includes(row.status) &&
    ["PENDING","SYNCED","CONFLICT"].includes(row.notion_mirror_status);
}

/** Exhaustive, bounded only by underlying D1/Notion query limits; abort on any uncertainty. */
export async function buildServicesV3NotionBootstrapInventory(
  db:DB,registry:Registry,
):Promise<CatalogBootstrapInventory>{
  if(!db?.prepare||!registry?.list)fail("MISSING_TRUSTED_READERS");
  await requireServiceCatalogAuditSchema(db);
  const [options,receipts,targets]=await Promise.all([
    db.prepare("SELECT id,kind,label,group_name,meaning,primary_category,categories_json,value_kind,version,status,notion_mirror_status FROM service_catalog_admin_options ORDER BY id").all<Row>(),
    db.prepare("SELECT option_id,option_version,notion_page_id FROM service_catalog_admin_notion_receipts ORDER BY option_id,option_version").all<Receipt>(),
    registry.list(),
  ]);
  const local=options?.results;
  const evidence=receipts?.results;
  if(!Array.isArray(local)||!Array.isArray(evidence)||!Array.isArray(targets))
    fail("INCOMPLETE_SNAPSHOT");
  if(local.some(row=>!checkCanonicalOption(row)))fail("INVALID_CANONICAL_OPTION");
  if(new Set(local.map(row=>row.id)).size!==local.length)fail("DUPLICATE_CANONICAL_ID");
  const mapped=new Map<string,Mapping>();
  const ownedPages=new Set<string>();
  for(const target of targets){
    if(!target || !idPattern.test(target.optionId) ||
       !uuid.test(target.pageId) || !uuid.test(target.dataSourceId) ||
       normalUuid(target.dataSourceId)!==normalUuid(canonicalSource))
      fail("INVALID_NOTION_MAPPING");
    const pageKey=normalUuid(target.pageId);
    if(mapped.has(target.optionId)||ownedPages.has(pageKey))
      fail("DUPLICATE_NOTION_MAPPING");
    mapped.set(target.optionId,target);
    ownedPages.add(pageKey);
  }
  const byOption=new Map<string,Receipt[]>();
  for(const receipt of evidence){
    if(!receipt || !idPattern.test(receipt.option_id) ||
      !Number.isSafeInteger(receipt.option_version) ||
      receipt.option_version<1||!uuid.test(receipt.notion_page_id))
      fail("INVALID_RECEIPT");
    if(!byOption.has(receipt.option_id))byOption.set(receipt.option_id,[]);
    byOption.get(receipt.option_id)!.push(receipt);
  }
  const localIds=new Set(local.map(row=>row.id));
  const unmappedNotionOptionIds=[...mapped.keys()].filter(id=>!localIds.has(id));
  const items:BootstrapItem[]=[];
  for(const row of local){
    const mappedPage=mapped.get(row.id);
    const history=byOption.get(row.id)??[];
    const forVersion=history.filter(h=>h.option_version===row.version);
    const pageDifferent=history.some(h=>mappedPage &&
      normalUuid(h.notion_page_id)!==normalUuid(mappedPage.pageId));
    const input={optionId:row.id,version:row.version};
    if(pageDifferent||forVersion.length>1||history.some(h=>h.option_version>row.version)) {
      items.push({...input,disposition:"BLOCKED",reason:"RECEIPT_OWNERSHIP_OR_VERSION_CONFLICT"});
      continue;
    }
    if(row.status==="DRAFT"&&row.notion_mirror_status==="PENDING"){
      if(forVersion.length){
        items.push({...input,disposition:"BLOCKED",reason:"PENDING_HAS_CURRENT_RECEIPT"});
      }else if(mappedPage){
        items.push({...input,disposition:"MAPPED_PENDING",pageId:mappedPage.pageId});
      }else if(history.length){
        items.push({...input,disposition:"BLOCKED",reason:"HISTORIC_RECEIPT_WITHOUT_OWNER"});
      }else{
        items.push({...input,disposition:"NEEDS_PAGE"});
      }
    }else if(row.notion_mirror_status==="SYNCED" && mappedPage &&
             forVersion.length===1 &&
             normalUuid(forVersion[0].notion_page_id)===normalUuid(mappedPage.pageId)){
      items.push({...input,disposition:"SYNCED_VERIFIED",pageId:mappedPage.pageId});
    }else{
      items.push({...input,disposition:"BLOCKED",reason:"NON_PENDING_OR_RECEIPT_MISSING"});
    }
  }
  const blocked=unmappedNotionOptionIds.length>0 ||
    evidence.some(r=>!localIds.has(r.option_id)) ||
    items.some(item=>item.disposition==="BLOCKED");
  return {
    mode:"READ_ONLY",dataSourceId:canonicalSource,
    canonicalDynamicCount:local.length,notionPageCount:targets.length,
    receiptCount:evidence.length,safeForAutomaticWrite:false,
    blocked,items,unmappedNotionOptionIds
  };
}
