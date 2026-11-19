/**
 * Plemená: 341 chýbajúcich pomocných zrkadiel 12 Notion polí.
 * Nezávislé od migrácie 0174. Bez produkčných zápisov pri načítaní modulu.
 *
 * Žiadne vypĺňanie default hodnotami pri chýbajúcej/nesprávnej Notion bunke.
 * Existujúce zrkadlá sa nikdy neprepisujú.
 */
import {
  BREED_CONTROLLED_FIELDS,
  breedControlledKeys,
  parseBreedControlledValues,
  readBreedControlledNotionPage,
} from "./breed-workcopy-controlled.mjs";

export const MIRROR_COHORT = Object.freeze({breeds:347,active:344,extraIds:[5,13,14]});
export const MIRROR_KEYS = breedControlledKeys;

export function breedMirrorUuid(value) {
  const s=String(value??"").replaceAll("-","").toLowerCase();
  return /^[0-9a-f]{32}$/.test(s)?s:"";
}
function notionId(page) {
  const p=page?.properties?.["Psipedia ID"];
  const a=p?.type==="rich_text"?p.rich_text:p?.type==="title"?p.title:null;
  const raw=Array.isArray(a)?a.map(v=>v.plain_text??v.text?.content??"").join("").trim():"";
  if(!/^[1-9]\d*$/.test(raw)) return null;
  const n=Number(raw);
  return Number.isSafeInteger(n)?n:null;
}
function validMirror(row){
  try{
    if(!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<0)return null;
    const raw=JSON.parse(row.values_json);
    const notionRaw=JSON.parse(row.notion_values_json);
    if(!raw||!notionRaw||Array.isArray(raw)||Array.isArray(notionRaw)||
      breedControlledKeys.some(k=>!Object.hasOwn(raw,k)||!Object.hasOwn(notionRaw,k)))return null;
    const a=parseBreedControlledValues(raw),b=parseBreedControlledValues(notionRaw);
    return {values:a,notion:b};
  }catch{return null}
}
function checkLinkedPage(link,page,expectedSource){
  const lid=breedMirrorUuid(link.work_notion_page_id);
  const pid=breedMirrorUuid(page?.id);
  const parent=breedMirrorUuid(page?.parent?.data_source_id);
  return Number.isSafeInteger(Number(link.breed_id)) && Number(link.breed_id)>0 &&
    link.status==="ACTIVE" && lid && lid===pid &&
    parent===expectedSource && breedMirrorUuid(link.work_data_source_id)===expectedSource &&
    page?.parent?.type==="data_source_id" && !page.archived && !page.in_trash &&
    notionId(page)===Number(link.breed_id);
}

/** Plan with ALL 344 current Notion pages and ACTIVE D1 links. No writes. */
export function planBreedControlledMirrorBackfill({
  links,pages,existing,expectedSource,
}){
  if(!Array.isArray(links)||!Array.isArray(pages)||!Array.isArray(existing))
    throw Error("BREED_MIRROR_INPUT_LISTS_REQUIRED");
  const source=breedMirrorUuid(expectedSource);
  if(!source)throw Error("BREED_MIRROR_SOURCE_INVALID");
  const issues=[],newRows=[],seenLinks=new Set(),seenPages=new Set();
  const issue=(code,breedId)=>issues.push({code,...(breedId?{breedId}:{})});
  if(links.length!==MIRROR_COHORT.active)issue("LINK_COUNT_NOT_344");
  if(pages.length!==MIRROR_COHORT.active)issue("NOTION_PAGE_COUNT_NOT_344");
  const pageByUUID=new Map();
  for(const page of pages){
    const uid=breedMirrorUuid(page?.id);
    if(!uid||pageByUUID.has(uid)){issue("NOTION_PAGE_UUID_DUPLICATE_OR_BAD");continue}
    pageByUUID.set(uid,page);
  }
  const saved=new Map();
  for(const row of existing){
    const id=Number(row?.breed_id);
    if(!Number.isSafeInteger(id)||id<=0||saved.has(id)){issue("D1_MIRROR_DUPLICATE_OR_BAD_ID");continue}
    saved.set(id,row);
  }
  for(const link of links){
    const id=Number(link?.breed_id),uid=breedMirrorUuid(link?.work_notion_page_id);
    if(!Number.isSafeInteger(id)||id<=0||!uid||
      seenLinks.has(id)||seenPages.has(uid)){
      issue("ACTIVE_LINK_DUPLICATE_OR_BAD_ID",id);continue;
    }
    seenLinks.add(id);seenPages.add(uid);
    const page=pageByUUID.get(uid);
    if(!page||!checkLinkedPage(link,page,source)){
      issue("NOTION_PAGE_ID_OWNERSHIP_MISMATCH",id);continue;
    }
    const parsed=readBreedControlledNotionPage(page);
    if(parsed.errors.length||Object.keys(parsed.values).length!==BREED_CONTROLLED_FIELDS.length){
      issue("NOTION_12_CONTROLLED_FIELDS_INVALID",id);continue;
    }
    const current=parseBreedControlledValues(parsed.values);
    const prev=saved.get(id);
    if(prev){
      const stored=validMirror(prev);
      if(!stored){issue("EXISTING_D1_MIRROR_INVALID",id);continue}
      if(JSON.stringify(stored.values)!==JSON.stringify(stored.notion)){
        issue("EXISTING_MIRROR_PENDING_SYNC",id);continue;
      }
      // Alert instead of overwriting existing Admin data on a remote edit.
      if(JSON.stringify(stored.values)!==JSON.stringify(current))
        issue("EXISTING_MIRROR_DIFFERS_FROM_NOTION",id);
      continue;
    }
    newRows.push({
      breedId:id,pageUUID:uid,
      valuesJson:JSON.stringify(current),
      notionEditedAt:page.last_edited_time??null,
    });
  }
  for(const page of pages)if(!seenPages.has(breedMirrorUuid(page.id)))
    issue("NOTION_PAGE_NOT_IN_ACTIVE_LINK",notionId(page));
  for(const id of saved.keys())if(!seenLinks.has(id))
    issue("D1_MIRROR_OUTSIDE_ACTIVE_LINK",id);
  newRows.sort((a,b)=>a.breedId-b.breedId);
  return {
    ready:issues.length===0&&newRows.length+saved.size===MIRROR_COHORT.active,
    linkedCount:links.length,notionCount:pages.length,existingCount:saved.size,
    missingCount:newRows.length,existingIds:[...saved.keys()].sort((a,b)=>a-b),
    issues,newRows,
  };
}

const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
/**
 * One SQLite statement, atomic (all 341 insert or zero). The read-only audit
 * and Notion preflight run before SQL; the SQL itself rechecks D1 link identity,
 * the 347/344 cohort, and unchanged existing-mirror count.
 */
export function breedControlledMirrorAtomicInsert(plan,expectedSource){
  if(!plan?.ready||!Number.isSafeInteger(plan.missingCount)||plan.missingCount<1||
    plan.missingCount+plan.existingCount!==MIRROR_COHORT.active||
    plan.newRows.length!==plan.missingCount)
    throw Error("BREED_MIRROR_INSERT_PLAN_INCOMPLETE");
  const source=breedMirrorUuid(expectedSource);
  if(!source)throw Error("BREED_MIRROR_INSERT_SOURCE_INVALID");
  const ids=new Set(),pages=new Set();
  const tuples=plan.newRows.map(row=>{
    if(!Number.isSafeInteger(row.breedId)||row.breedId<=0||
      ids.has(row.breedId)||!breedMirrorUuid(row.pageUUID)||
      pages.has(row.pageUUID))throw Error("BREED_MIRROR_INSERT_DUPLICATE");
    const values=validMirror({revision:0,values_json:row.valuesJson,
      notion_values_json:row.valuesJson});
    if(!values)throw Error("BREED_MIRROR_INSERT_FIELDS_INVALID");
    ids.add(row.breedId);pages.add(row.pageUUID);
    return "("+row.breedId+","+quote(row.pageUUID)+","+quote(row.valuesJson)+")";
  });
  return `WITH candidates(breed_id,page_uuid,payload) AS (
    VALUES ${tuples.join(",\n    ")}
  ), verified AS (
    SELECT c.breed_id,c.payload
    FROM candidates c
    JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id
    JOIN managed_breeds m ON m.id=c.breed_id
    LEFT JOIN breed_notion_controlled_values v ON v.breed_id=c.breed_id
    WHERE l.status='ACTIVE'
      AND replace(lower(l.work_notion_page_id),'-','')=c.page_uuid
      AND replace(lower(l.work_data_source_id),'-','')=${quote(source)}
      AND v.breed_id IS NULL
  )
  INSERT INTO breed_notion_controlled_values
    (breed_id,values_json,notion_values_json,revision)
  SELECT breed_id,payload,payload,0 FROM verified
  WHERE (SELECT COUNT(*) FROM verified)=${plan.missingCount}
    AND (SELECT COUNT(*) FROM managed_breeds)=347
    AND (SELECT COUNT(*) FROM breed_notion_workcopy_links WHERE status='ACTIVE')=344
    AND (SELECT COUNT(*) FROM breed_notion_controlled_values)=${plan.existingCount};`;
}


/**
 * Narrow SQL statement guard for the owner-only production mirror backfill.
 * The generated statement legitimately contains SQLite's REPLACE(...) scalar
 * function, used to normalize UUIDs. Ban REPLACE INTO (a write statement),
 * not REPLACE(...). Only one WITH ... INSERT INTO ... SELECT is permitted.
 */
export function isBreedControlledMirrorInsertOnlySql(sql) {
  if(typeof sql!=="string"||
      !/^WITH candidates\s*\(/i.test(sql)||
      !/\bINSERT\s+INTO\s+breed_notion_controlled_values\b/i.test(sql)||
      !/\bSELECT\s+breed_id\s*,\s*payload\s*,\s*payload\s*,\s*0\s+FROM\s+verified\b/i.test(sql))
    return false;
  // The only semicolon may terminate the statement.
  if(sql.trim().slice(0,-1).includes(";")||!sql.trim().endsWith(";"))
    return false;
  if(/\b(?:UPDATE|DELETE|DROP|ALTER|ATTACH|DETACH|VACUUM|PRAGMA|TRUNCATE)\b/i.test(sql)||
      /\bREPLACE\s+INTO\b/i.test(sql)||
      /\bCREATE\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i.test(sql))
    return false;
  return true;
}
