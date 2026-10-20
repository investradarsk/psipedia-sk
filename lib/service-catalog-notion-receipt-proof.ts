/**
 * Services V3 / 0134: OFFLINE, side-effect-free read-after-write receipt decision.
 * Never expose this function directly to an HTTP caller. Its input MUST be
 * assembled by a trusted worker from independently read D1 and Notion data.
 * A property saying "SYNCED" (or claiming a trusted origin) is not evidence.
 * No database/HTTP writes or lifecycle integration happen in this module.
 */
export type ReceiptProofFailure =
  | "INVALID_INPUT" | "UNTRUSTED_STATE" | "STALE_VERSION" | "SOURCE_MISMATCH"
  | "PAGE_MISMATCH" | "REMOTE_PROOF_MISSING" | "REMOTE_CHANGED"
  | "PAYLOAD_MISMATCH" | "PAYLOAD_HASH_MISMATCH" | "TIME_INVALID"
  | "DUPLICATE_RECEIPT" | "IDENTITY_CONFLICT";

export type ReceiptProofDecision =
  | {ok:false;reason:ReceiptProofFailure}
  | {ok:true;receipt:Readonly<{
      option_id:string;option_version:number;notion_page_id:string;
      notion_last_edited_at:string;remote_payload_sha256:string;
      verified_at:string;verified_by:string;
    }>;
    guard:Readonly<{
      optionId:string;expectedVersion:number;nextVersion:number;
      expectedStatus:"DRAFT";expectedMirrorStatus:"PENDING";
      requiredAbsentReceiptVersion:number;
    }>};

type Fields = {
  kind:"service"|"attribute";label:string;group:string;meaning:string;
  primaryCategory:string;categories:string[];valueKind:"tri_state";
};
type Local = Fields & {
  id:string;version:number;status:"DRAFT"|"ACTIVE"|"RETIRED";
  notionMirrorStatus:"PENDING"|"SYNCED"|"CONFLICT";
};
type WriteAck = {
  optionId:string;optionVersion:number;pageId:string;
  notionLastEditedAt:string;completedAt:string;
};
type Remote = {
  pageId:string;dataSourceId:string;sourceOptionId:string;sourceOptionVersion:number;
  notionLastEditedAt:string;fetchedAt:string;archived:boolean;inTrash:boolean;
  fields:Fields;payloadSha256:string;
};
type Context = {
  expectedDataSourceId:string;expectedPageId:string;verifiedAt:string;
  verifiedBy:string;
  currentOptionId:string;currentVersion:number;
  receipts:{optionId:string;optionVersion:number;pageId:string}[];
  pageMappings:{optionId:string;pageId:string}[];
};
const OPTION_ID=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const fieldKeys=["kind","label","group","meaning","primaryCategory","categories","valueKind"];
function record(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
  return record(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
}
function uuid(v:unknown):v is string{return typeof v==="string"&&UUID.test(v);}
function sameUuid(a:string,b:string){return a.replaceAll("-","").toLowerCase()===b.replaceAll("-","").toLowerCase();}
function time(v:unknown):number|null{
  if(typeof v!=="string"||!ISO.test(v))return null;
  const ms=Date.parse(v);return Number.isFinite(ms)&&new Date(ms).toISOString().replace(/\.000Z$/,"Z")===v.replace(/\.000Z$/,"Z")?ms:null;
}
function fields(v:unknown):v is Fields{
  if(!exact(v,fieldKeys)||!["service","attribute"].includes(v.kind as string)||v.valueKind!=="tri_state"
    ||!["label","group","meaning","primaryCategory"].every(k=>typeof v[k]==="string"&&(v[k] as string).trim().length>0)
    ||!Array.isArray(v.categories)||v.categories.length===0||v.categories.length>100
    ||v.categories.some(c=>typeof c!=="string"||c.trim()!==c||!c)
    ||new Set(v.categories).size!==v.categories.length||!v.categories.includes(v.primaryCategory))return false;
  return true;
}
function local(v:unknown):v is Local{
  return record(v)&&exact(v,[...fieldKeys,"id","version","status","notionMirrorStatus"])
    &&fields(Object.fromEntries(fieldKeys.map(k=>[k,v[k]])))
    &&typeof v.id==="string"&&OPTION_ID.test(v.id)
    &&((v.kind==="service"&&v.id.startsWith("svc."))||(v.kind==="attribute"&&v.id.startsWith("attr.")))
    &&Number.isSafeInteger(v.version)&&(v.version as number)>0
    &&["DRAFT","ACTIVE","RETIRED"].includes(v.status as string)
    &&["PENDING","SYNCED","CONFLICT"].includes(v.notionMirrorStatus as string);
}
function write(v:unknown):v is WriteAck{
  return exact(v,["optionId","optionVersion","pageId","notionLastEditedAt","completedAt"])
    &&typeof v.optionId==="string"&&Number.isSafeInteger(v.optionVersion)
    &&uuid(v.pageId)&&time(v.notionLastEditedAt)!==null&&time(v.completedAt)!==null;
}
function remote(v:unknown):v is Remote{
  return exact(v,["pageId","dataSourceId","sourceOptionId","sourceOptionVersion","notionLastEditedAt","fetchedAt","archived","inTrash","fields","payloadSha256"])
    &&uuid(v.pageId)&&uuid(v.dataSourceId)&&typeof v.sourceOptionId==="string"
    &&Number.isSafeInteger(v.sourceOptionVersion)&&typeof v.archived==="boolean"&&typeof v.inTrash==="boolean"
    &&time(v.notionLastEditedAt)!==null&&time(v.fetchedAt)!==null
    &&fields(v.fields)&&typeof v.payloadSha256==="string"&&SHA.test(v.payloadSha256);
}
function context(v:unknown):v is Context{
  return exact(v,["expectedDataSourceId","expectedPageId","verifiedAt","verifiedBy","currentOptionId","currentVersion","receipts","pageMappings"])
    &&uuid(v.expectedDataSourceId)&&uuid(v.expectedPageId)&&time(v.verifiedAt)!==null
    &&v.verifiedBy==="service-catalog-notion-reconciler-v1"
    &&typeof v.currentOptionId==="string"&&Number.isSafeInteger(v.currentVersion)
    &&Array.isArray(v.receipts)&&v.receipts.every(x=>exact(x,["optionId","optionVersion","pageId"])
      &&typeof x.optionId==="string"&&Number.isSafeInteger(x.optionVersion)&&uuid(x.pageId))
    &&Array.isArray(v.pageMappings)&&v.pageMappings.every(x=>exact(x,["optionId","pageId"])
      &&typeof x.optionId==="string"&&uuid(x.pageId));
}
function projection(optionId:string,version:number,f:Fields):string{
  // Hash only canonical semantics; remote metadata is validated separately.
  return JSON.stringify({schema:"psipedia.service-option.v1",source:"psipedia-d1:service_catalog_admin_options",
    optionId,version,kind:f.kind,label:f.label,group:f.group,meaning:f.meaning,
    primaryCategory:f.primaryCategory,categories:[...f.categories].sort(),valueKind:f.valueKind});
}
async function sha256(input:string):Promise<string>{
  const data=new TextEncoder().encode(input);
  const digest=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
/**
 * Produces a candidate for an ATOMIC CAS + INSERT transaction, not a receipt
 * insertion command or a verified attestation by itself. The worker must supply
 * independently authenticated GET /pages/{id} data and a D1 snapshot.
 */
export async function validateServiceNotionReceiptProof(raw:unknown):Promise<ReceiptProofDecision>{
  const reject=(reason:ReceiptProofFailure):ReceiptProofDecision=>({ok:false,reason});
  if(!exact(raw,["local","writeAck","remoteRead","context"]))return reject("INVALID_INPUT");
  const {local:l,writeAck:w,remoteRead:r,context:c}=raw;
  if(!local(l)||!write(w)||!context(c))return reject("INVALID_INPUT");
  if(l.status!=="DRAFT"||l.notionMirrorStatus!=="PENDING")return reject("UNTRUSTED_STATE");
  if(l.version>=Number.MAX_SAFE_INTEGER||l.id!==c.currentOptionId||l.version!==c.currentVersion)
    return reject("STALE_VERSION");
  if(w.optionId!==l.id||w.optionVersion!==l.version)return reject("STALE_VERSION");
  if(!remote(r))return reject("REMOTE_PROOF_MISSING");
  if(!sameUuid(r.dataSourceId,c.expectedDataSourceId)||r.sourceOptionId!==l.id||r.sourceOptionVersion!==l.version)
    return reject("SOURCE_MISMATCH");
  if(!sameUuid(w.pageId,c.expectedPageId)||!sameUuid(r.pageId,c.expectedPageId))return reject("PAGE_MISMATCH");
  if(c.pageMappings.some(m=>sameUuid(m.pageId,c.expectedPageId)&&m.optionId!==l.id)
    ||c.pageMappings.some(m=>m.optionId===l.id&&!sameUuid(m.pageId,c.expectedPageId)))return reject("IDENTITY_CONFLICT");
  const nextVersion=l.version+1;
  if(c.receipts.some(x=>x.optionId===l.id&&x.optionVersion===nextVersion))return reject("DUPLICATE_RECEIPT");
  if(c.receipts.some(x=>x.optionId!==l.id&&sameUuid(x.pageId,c.expectedPageId)))return reject("IDENTITY_CONFLICT");
  if(r.archived||r.inTrash)return reject("REMOTE_CHANGED");
  if(r.notionLastEditedAt!==w.notionLastEditedAt)return reject("REMOTE_CHANGED");
  const a=time(w.completedAt)!,b=time(r.fetchedAt)!,d=time(c.verifiedAt)!,last=time(r.notionLastEditedAt)!;
  if(a>b||b>d||last>b||last>a||d-b>5*60*1000)return reject("TIME_INVALID");
  const [localHash,remoteHash]=await Promise.all([
    sha256(projection(l.id,l.version,l)),
    sha256(projection(r.sourceOptionId,r.sourceOptionVersion,r.fields)),
  ]);
  if(remoteHash!==r.payloadSha256)return reject("PAYLOAD_HASH_MISMATCH");
  if(localHash!==remoteHash)return reject("PAYLOAD_MISMATCH");
  return {ok:true,receipt:{option_id:l.id,option_version:nextVersion,
    notion_page_id:c.expectedPageId.toLowerCase(),notion_last_edited_at:r.notionLastEditedAt,
    remote_payload_sha256:remoteHash,verified_at:c.verifiedAt,
    verified_by:c.verifiedBy},guard:{optionId:l.id,expectedVersion:l.version,
      nextVersion,expectedStatus:"DRAFT",expectedMirrorStatus:"PENDING",requiredAbsentReceiptVersion:nextVersion}};
}
