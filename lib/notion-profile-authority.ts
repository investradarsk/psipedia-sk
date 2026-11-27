import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";
import { breedControlledKeys } from "./breed-workcopy-controlled.mjs";
import type { FieldIdentity, ProfileAuthorityContext, UnifiedSyncAgenda } from "./notion-unified-field-sync.ts";
import { directoryProfileNotionSyncLocked } from "./directory-reviewed-sync-lock.ts";
import { isAdminNotionSyncLocked, type LockableAgenda } from "./admin-notion-review-lock.ts";

export type ProfileAuthorityBindings = {
  NOTION_PROFILE_AUTHORITY_MODE?: string;
};

/** Staged integration only. Never configure this on production before all
 * direct/legacy writes, review transitions and creation paths are verified. */
export function profileAuthorityEnabled(bindings?: ProfileAuthorityBindings):boolean {
  return bindings?.NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
}

const textFields:Record<UnifiedSyncAgenda,readonly string[]> = {
  directory:["name","excerpt","description","priceNote","websiteUrl","publicPhone","publicEmail","facebookUrl","instagramUrl","seo.title","seo.description","seo.focusKeyword","seo.canonicalUrl","seo.ogTitle","seo.ogDescription","seo.noindex","seo.ogImage"],
  breeds:[...BREED_NOTION_SCHEMA.filter(entry=>entry.mode==="content"&&Boolean(breedWorkcopyPhysicalProperty(entry.notion))&&
    !["gallery","sports","sources","healthRisks","goodFor","consider","editorial.heroTraits","editorialComplete","image"].includes(entry.id)).map(entry=>entry.id),
    ...breedControlledKeys.map((key:string)=>"controlled."+key)],
  events:["title","eventType","startDate","endDate","startTime","endTime","organizer","excerpt","description","practicalInfo","contactPhone","contactEmail","admissionFee","websiteUrl","registrationUrl","imageAlt","seo.title","seo.description","seo.focusKeyword","seo.canonicalUrl","seo.ogTitle","seo.ogDescription"],
  organizations:["Názov","Právny názov","Krátky popis","Popis","Verejný e-mail","Verejný telefón","Web","Facebook","Instagram"],
  adoptions:["Meno","Dátum narodenia","Vek mesiace","Pohlavie","Veľkosť","Hmotnosť","Kríženec","Farba","Mesto","Okres","Kraj","Krátky popis","Popis","Povaha","Aktivita","Zdravotné poznámky","Špeciálne potreby","Vhodný k deťom","Vhodný k psom","Vhodný k mačkám","Vhodný k iným zvieratám","Očkovanie","Podmienky adopcie","Kontaktný e-mail","Kontaktný telefón","Kontaktný odkaz","Zdroj dát"],
  "lost-found":["Meno psa","Pohlavie","Farba","Vek","Veľkosť","Krátky popis","Popis","Rozlišovacie znaky","Obojok","Čip","Dátum udalosti","Kraj","Okres","Mesto"],
  "help-cases":["Názov","Perex","Popis","Pes","Plemeno","Vek","Mesto","Kraj","Miesto","Dátum hlásenia","Deadline","CTA text","CTA URL","Cieľ","Vyzbierané","Urgentné"],
  eshops:["name","websiteUrl","description","sourceUrl","focusTags"],
};
export function profileAuthorityTextFieldAllowed(identity:FieldIdentity):boolean {
  return textFields[identity.agenda]?.includes(identity.field)===true;
}

const specs = {
  directory:{table:"directory_profiles",kind:"directory",map:"directory_notion_sync",id:"directory_profile_id",page:"notion_page_id"},
  breeds:{table:"managed_breeds",kind:"breeds",map:"breed_notion_workcopy_links",id:"breed_id",page:"work_notion_page_id"},
  events:{table:"managed_events",kind:"events",map:"event_notion_sync",id:"event_id",page:"notion_page_id"},
  organizations:{table:"help_organizations",kind:"organizations",map:"notion_agenda_sync",id:"entity_id",page:"notion_page_id"},
  adoptions:{table:"adoption_dogs",kind:"adoptions",map:"notion_agenda_sync",id:"entity_id",page:"notion_page_id"},
  "lost-found":{table:"lost_found_dog_reports",kind:"lost-found",map:"notion_agenda_sync",id:"entity_id",page:"notion_page_id"},
  "help-cases":{table:"help_cases",kind:"help",map:"notion_agenda_sync",id:"entity_id",page:"notion_page_id"},
  eshops:{table:"managed_eshops",kind:"eshops",map:"eshop_notion_sync",id:"eshop_id",page:"notion_page_id"},
} as const;

/** Server-side canonical identity and ownership check. An absent or changed
 * record, mapping, tombstone, active fence or review never permits a pull.
 * SQL errors propagate. Breeds/E-shops use the existing review table; their
 * review UI/transition writers still require integration before activation. */
export async function readProfileAuthorityOwner(db:D1Database,identity:FieldIdentity):Promise<ProfileAuthorityContext["owner"]>{
  const id=Number(identity.entityId),spec=specs[identity.agenda];
  if(!spec||!Number.isSafeInteger(id)||id<1||String(id)!==identity.entityId||!identity.pageId)
    throw Error("PROFILE_AUTHORITY_IDENTITY_INVALID");
  const row=await db.prepare(
    "SELECT p.status,EXISTS(SELECT 1 FROM admin_record_tombstones t WHERE t.kind=?2 AND t.record_id=p.id) AS removed,"+
    "EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda=?3 AND f.entity_id=?4) AS fenced "+
    "FROM "+spec.table+" p JOIN "+spec.map+" m ON m."+spec.id+"=p.id "+
    "WHERE p.id=?1 AND m."+spec.page+"=?5"+
    (spec.map==="notion_agenda_sync"?" AND m.agenda=?3":"")+
    (identity.agenda==="breeds"?" AND m.status='ACTIVE' AND COALESCE(m.work_last_error_code,'')<>'INBOUND_ID_PENDING'":"")
  ).bind(id,spec.kind,identity.agenda,identity.entityId,identity.pageId).first<{status:string;removed:number;fenced:number}>();
  if(!row||row.removed||String(row.status).toLowerCase()==="archived")return "admin";
  if(row.fenced)return "unlocking";
  if(identity.agenda==="directory")
    return await directoryProfileNotionSyncLocked(db,id)?"admin":"notion";
  if(identity.agenda==="breeds"||identity.agenda==="eshops"){
    const type=identity.agenda==="breeds"?"BREED":"ESHOP";
    const review=await db.prepare("SELECT 1 AS reviewed FROM admin_entity_reviews WHERE entity_type=? AND entity_id=?")
      .bind(type,id).first<{reviewed:number}>();
    return review?"admin":"notion";
  }
  return await isAdminNotionSyncLocked(db,identity.agenda as LockableAgenda,id)?"admin":"notion";
}
