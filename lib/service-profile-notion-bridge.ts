/**
 * Services V3 ↔ existing Directory Notion "Služby" bridge.
 * The canonical D1 choice table is authoritative; the legacy services_json
 * list is only a textual transport for the EXISTING directory sync pipeline.
 * Preserve unrelated free-text values: never infer "no" from missing legacy data.
 */
import {normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {loadResolvedServiceDefinitions} from "./service-catalog-resolved.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {saveAdminServiceChoice,resetAdminServiceChoice} from "./service-catalog-admin-store.ts";

type DB=D1Database;
type ChoiceRow={option_id:string;choice:"yes"|"no";version:number};
type Profile={id:number;category:string;services_json:string|null;updated_at:string|null};
const actor="notion-service-choices@psipedia.sk";
const categories=new Set<string>(serviceFilterCategories);
function parseServices(input:string|null):string[]{
  if(!input)return [];
  try{
    const parsed=JSON.parse(input);
    return Array.isArray(parsed)&&parsed.every(x=>typeof x==="string")?parsed:[];
  }catch{return [];}
}
async function allowedCatalog(db:DB,category:string){
  if(!categories.has(category))return [];
  return loadResolvedServiceDefinitions(db,category);
}
type ResolvedOption=Awaited<ReturnType<typeof allowedCatalog>>[number];
/** Ambiguous historical aliases must not remove or reassign human text. */
function uniqueServiceTerms(available:readonly ResolvedOption[]):Map<string,string|null>{
  const terms=new Map<string,string|null>();
  for(const entry of available){
    for(const label of [entry.label,...entry.aliases]){
      const key=normalizeCatalogLabel(label);
      if(!key)continue;
      const old=terms.get(key);
      terms.set(key,old===undefined?entry.id:old===entry.id?entry.id:null);
    }
  }
  return terms;
}
/** After an explicit Admin checkbox write, make its matching legacy Notion text
 * reflect the same choice without deleting unrelated historic service names.
 * Called only after canonical CAS succeeds; a failed projection is reported.
 */
export async function projectServiceChoiceToDirectoryNotion(db:DB,profileId:number,optionId:string,choice:"yes"|"no"|"unknown"){
  const profile=await db.prepare(
    "SELECT id,category,services_json,updated_at FROM directory_profiles WHERE id=?1 LIMIT 1"
  ).bind(profileId).first<Profile>();
  if(!profile)throw Error("SERVICE_PROFILE_NOT_FOUND");
  const available=await allowedCatalog(db,profile.category);
  const item=available.find(s=>s.id===optionId);
  if(!item)return "unchanged" as const; // unrelated typed attribute, not a service
  if(profile.services_json!==null){
    try{
      const parsed=JSON.parse(profile.services_json);
      if(!Array.isArray(parsed)||!parsed.every(x=>typeof x==="string"))
        throw Error("INVALID_LEGACY_SERVICES_JSON");
    }catch{throw Error("INVALID_LEGACY_SERVICES_JSON");}
  }
  const existing=parseServices(profile.services_json);
  // A service edited in Admin keeps its original ID and former labels as
  // aliases. Remove stale names for this exact canonical service, not unrelated
  // historical free text.
  const terms=uniqueServiceTerms(available);
  const filtered=existing.filter(s=>terms.get(normalizeCatalogLabel(s))!==item.id);
  if(choice==="yes")filtered.push(item.label);
  if(JSON.stringify(filtered)===JSON.stringify(existing))return "unchanged" as const;
  const now=new Date().toISOString();
  const updated=await db.prepare(
    "UPDATE directory_profiles SET services_json=?1,updated_at=?2 "+
    "WHERE id=?3 AND COALESCE(services_json,'[]')=?4 AND updated_at IS ?5 RETURNING id"
  ).bind(JSON.stringify(filtered),now,profileId,profile.services_json??"[]",profile.updated_at)
    .first<{id:number}>();
  if(!updated)throw Error("SERVICE_NOTION_PROJECTION_CONCURRENT_CHANGE");
  return "updated" as const;
}
/**
 * Called only when the existing Directory Notion reconciler accepts a real
 * changed "Služby" field, after its protected three-way merge / D1 commit.
 * Exact catalog labels or aliases only; ambiguous aliases do not auto-map.
 * Unrecognized historic free text stays in directory_profiles.services_json.
 */
export async function importNotionServiceChoices(db:DB,profileId:number,category:string,names:readonly string[]){
  if(!categories.has(category))return {added:0,removed:0};
  const available=await allowedCatalog(db,category);
  const terms=uniqueServiceTerms(available);
  const selected=new Set<string>();
  for(const name of names){
    const id=terms.get(normalizeCatalogLabel(name));
    if(id)selected.add(id);
  }
  return importNotionServiceIds(db,profileId,category,[...selected],available);
}

/**
 * Apply exact canonical Notion relation IDs through independent CAS/audit
 * writes. Absence of an explicit YES resets it to unknown, never to NO.
 */
export async function importNotionServiceIds(
  db:DB,profileId:number,category:string,ids:readonly string[],
  resolved?:Awaited<ReturnType<typeof allowedCatalog>>,
){
  if(!categories.has(category))throw Error("SERVICES_RELATION_INVALID_CATEGORY");
  const available=resolved??await allowedCatalog(db,category);
  const availableIds=new Set(available.map(x=>x.id));
  const selected=new Set(ids);
  if([...selected].some(id=>!availableIds.has(id)))
    throw Error("SERVICES_RELATION_UNKNOWN_OR_WRONG_CATEGORY");
  const rows=await db.prepare(
    "SELECT option_id,choice,version FROM service_profile_option_choices WHERE profile_id=?1"
  ).bind(profileId).all<ChoiceRow>();
  const saved=new Map((rows.results??[]).map(row=>[row.option_id,row]));
  let added=0,removed=0;
  const failedIds:string[]=[];
  for(const id of selected){
    const prior=saved.get(id);
    if(prior?.choice==="yes")continue;
    try{
      await saveAdminServiceChoice(db,{profileId,optionId:id,choice:"yes",expectedVersion:prior?.version??0},actor);
      added++;
    }catch{
      // An unrelated service version conflict cannot block other independent
      // service IDs. The caller must NOT acknowledge a full relation baseline
      // when any item failed.
      failedIds.push(id);
    }
  }
  for(const row of rows.results??[]){
    if(row.choice!=="yes"||!availableIds.has(row.option_id)||selected.has(row.option_id))continue;
    try{
      // Only the verified relation reconciliation may reset a YES to unknown;
      // do not manufacture an explicit NO or alter unrelated choices.
      await resetAdminServiceChoice(db,{profileId,optionId:row.option_id,expectedVersion:row.version},actor);
      removed++;
    }catch{failedIds.push(row.option_id);}
  }
  if(failedIds.length)throw Error("SERVICES_RELATION_PARTIAL_CAS_FAILURE");
  return {added,removed};
}

/**
 * Keep the public legacy "Poskytované služby" list in step with confirmed
 * Services V3 YES choices. Add missing catalog labels only: never remove
 * historic free text or convert an omitted Notion value into a deletion.
 * Accept aliases as already present so "základná poslušnosť" is not duplicated.
 */
export async function ensureCanonicalServiceChoicesInLegacy(
  db: DB, profileId: number, selectedIds: readonly string[],
): Promise<number> {
  const profile = await db.prepare(
    "SELECT id,category,services_json,updated_at FROM directory_profiles WHERE id=?1 LIMIT 1",
  ).bind(profileId).first<Profile>();
  if (!profile) throw Error("SERVICE_PROFILE_NOT_FOUND");
  const available = await allowedCatalog(db, profile.category);
  const byId = new Map(available.map(option => [option.id, option]));
  if (profile.services_json !== null) {
    try {
      const parsed = JSON.parse(profile.services_json);
      if (!Array.isArray(parsed) || !parsed.every(x => typeof x === "string"))
        throw Error("INVALID_LEGACY_SERVICES_JSON");
    } catch { throw Error("INVALID_LEGACY_SERVICES_JSON"); }
  }
  const current = parseServices(profile.services_json);
  const next = [...current];
  const terms=uniqueServiceTerms(available);
  let updated = 0;
  for (const id of new Set(selectedIds)) {
    const option = byId.get(id);
    if (!option) throw Error("SERVICE_CATALOG_UNKNOWN_CHOICE");
    const at = next.findIndex(value => terms.get(normalizeCatalogLabel(value)) === option.id);
    if (at === -1) {
      next.push(option.label);
      updated++;
    } else if (next[at] !== option.label) {
      // Re-label an already selected canonical service without adding a
      // duplicate; preserve every other historical/unrecognized entry.
      next[at] = option.label;
      updated++;
    }
  }
  if (!updated) return 0;
  const result = await db.prepare(
    "UPDATE directory_profiles SET services_json=?1,updated_at=?2 " +
    "WHERE id=?3 AND COALESCE(services_json,'[]')=?4 AND updated_at IS ?5 RETURNING id",
  ).bind(JSON.stringify(next), new Date().toISOString(), profileId,
    profile.services_json ?? "[]", profile.updated_at).first<{id:number}>();
  if (!result) throw Error("SERVICE_LEGACY_PROJECTION_CONCURRENT_CHANGE");
  return updated;
}
