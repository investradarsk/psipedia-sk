import { ORGANIZATION_V2_COLUMNS, isOrganizationV2Field, ORGANIZATION_LOCATION_V2_COLUMNS, isOrganizationLocationV2Field, nextOrganizationEditRevision } from "./notion-organization-admin-receipts.ts";
import { normalizeOrganizationLocationAdminInput } from "./organization-location-admin.ts";
import { reconcileGeoAfterSourceMutation } from "./geo-store.ts";
import { normalizeOrganizationNotionField } from "./help-organization-admin-input.ts";
import { reserveUnifiedField, confirmUnifiedField } from "./notion-unified-field-transfer.ts";
import { readUnifiedAdminEdit } from "./notion-unified-admin-edits.ts";
import { readProfileFieldBaseline } from "./notion-profile-field-baseline.ts";
import { loadNotionBulkOrganizations } from "./notion-bulk-sources.ts";
import { isAdminNotionSyncLocked, partnerReviewOwnerSql } from "./admin-notion-review-lock.ts";
import { notionPageIsTombstoned } from "./admin-record-lifecycle.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared.ts";
import type { FieldObservation } from "./notion-unified-field-sync.ts";
import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";

const PROTECTED = new Set(["Slug", "Stav", "Typ"]);
const ACTOR = "notion-events-help-sync@psipedia.sk";

/** A missing or truncated property is not an observed empty value. */
export function organizationNotionObservation(page: NotionPage, field: string): FieldObservation {
  const property = page.properties?.[field] as Record<string, unknown> | undefined;
  if (!property || typeof property !== "object") return {present:false};
  const type = property.type;
  if(field==="Psipedia ID" && type==="number" && typeof property.number==="number" && Number.isSafeInteger(property.number))
    return {present:true,value:String(property.number)};
  if (type === "title" || type === "rich_text") {
    const parts = property[type];
    if (!Array.isArray(parts) || parts.length >= 25 || parts.some(item => !item || typeof item.plain_text !== "string"))
      return {present:false};
    return {present:true,value:parts.map(item => item.plain_text).join("").trim()};
  }
  if (type === "url" || type === "email" || type === "phone_number")
    return property[type] === null || typeof property[type] === "string"
      ? {present:true,value:typeof property[type] === "string" ? property[type].trim() : ""} : {present:false};
  if (type === "select" || type === "status") {
    const value=property[type] as {name?:unknown}|null|undefined;
    return value === null || typeof value?.name === "string"
      ? {present:true,value:typeof value?.name === "string" ? value.name.trim() : ""} : {present:false};
  }
  return {present:false};
}
export type OrganizationV2Scope = { database: D1Database; bindings: NotionSyncBindings; entityId:number; pageId:string; dataSourceId:string };
type LocationRow = {id:number;role:string;label:string;address:string;city:string;district:string;region:string;country_code:string;is_primary:number;sort_order:number;google_current:number};
const selectedLocationSql = "SELECT id FROM organization_locations WHERE organization_id=? "+
  "ORDER BY CASE WHEN role='SITE' THEN 0 ELSE 1 END,is_primary DESC,sort_order,id LIMIT 1";
const currentGoogleSql = "EXISTS(SELECT 1 FROM geo_points g WHERE g.target_type='ORGANIZATION_LOCATION' AND g.organization_location_id=organization_locations.id "+
  "AND NULLIF(trim(g.google_place_id),'') IS NOT NULL AND NULLIF(trim(g.source_fingerprint),'') IS NOT NULL "+
  "AND g.source_fingerprint=g.google_place_source_fingerprint)";
async function readLocation(database:D1Database,entityId:number) {
  return database.prepare("SELECT id,role,label,address,city,district,region,country_code,is_primary,sort_order,"+
    currentGoogleSql+" AS google_current FROM organization_locations WHERE id=("+selectedLocationSql+")")
    .bind(entityId).first<LocationRow>();
}
async function observe(input: OrganizationV2Scope, field: string, allowSlugChange: boolean) {
  const {database,bindings,entityId,pageId,dataSourceId}=input;
  if(await isAdminNotionSyncLocked(database,"organizations",entityId) || await notionPageIsTombstoned(database,pageId))
    throw Error("ORGANIZATION_V2_LOCKED");
  const mapping=await database.prepare("SELECT notion_page_id,content_hash FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=?").bind(entityId).first<{notion_page_id:string;content_hash:string}>();
  if(mapping?.notion_page_id!==pageId)throw Error("ORGANIZATION_V2_MAPPING_CHANGED");
  const before=await database.prepare("SELECT updated_at,status,archived_at FROM help_organizations WHERE id=?").bind(entityId).first<{updated_at:string;status:string;archived_at:string|null}>();
  if(!before)throw Error("ORGANIZATION_V2_MISSING");
  const location=isOrganizationLocationV2Field(field) ? await readLocation(database,entityId) : null;
  const source=(await loadNotionBulkOrganizations(database,entityId)).find(record=>record.id===String(entityId));
  const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId));
  if(!source || page.id!==pageId || !notionPageBelongsToDataSource(page,dataSourceId))
    throw Error("ORGANIZATION_V2_SOURCE_CHANGED");
  const identity=organizationNotionObservation(page,"Psipedia ID");
  const url=organizationNotionObservation(page,"URL Psipedia");
  if(!identity.present || identity.value!==String(entityId) || !url.present || (!allowSlugChange && url.value!==source.url))
    throw Error("ORGANIZATION_V2_IDENTITY_CHANGED");
  const after=await database.prepare("SELECT updated_at FROM help_organizations WHERE id=?").bind(entityId).first<{updated_at:string}>();
  if(after?.updated_at!==before.updated_at || (isOrganizationLocationV2Field(field) && JSON.stringify(location)!==JSON.stringify(await readLocation(database,entityId))))
    throw Error("ORGANIZATION_V2_REVISION_CHANGED");
  return {page,source,mapping,location,revision:before.updated_at,archived:before.status==="ARCHIVED"||!!before.archived_at,
    notion:organizationNotionObservation(page,field),
    psipedia:Object.hasOwn(source.properties,field) ? {present:true as const,value:source.properties[field]} : {present:false as const}};
}

async function pullScalar(input:OrganizationV2Scope,field:string,value:unknown,revision:string) {
  if(!isOrganizationV2Field(field))throw Error("ORGANIZATION_V2_FIELD_PROTECTED");
  const normalized=normalizeOrganizationNotionField(field,value);
  // URL normalization is allowed only when it does not silently change the
  // requested observed value. A differing canonical value remains review.
  const comparable=field==="Hlavný obrázok URL" && normalized?.startsWith("/") ? "https://psipedia.sk"+normalized : normalized??"";
  if(comparable!==value)throw Error("ORGANIZATION_V2_NORMALIZATION_REVIEW");
  const media=field==="Hlavný obrázok URL" ? ",image_key=NULL,thumbnail_display_json=NULL,detail_display_json=NULL" : "";
  const result=await input.database.prepare(
    "UPDATE help_organizations SET "+ORGANIZATION_V2_COLUMNS[field]+"=?"+media+",updated_at=?,updated_by=? "+
    "WHERE id=? AND updated_at=? AND archived_at IS NULL AND status<>'ARCHIVED' "+
    "AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='ORGANIZATION' AND entity_id=help_organizations.id) "+
    "AND NOT "+partnerReviewOwnerSql("ORGANIZATION","help_organizations.id")+" "+
    "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='organizations' AND record_id=help_organizations.id) "+
    "AND EXISTS(SELECT 1 FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=help_organizations.id AND notion_page_id=?)"
  ).bind(normalized,nextOrganizationEditRevision(revision,new Date()),ACTOR,input.entityId,revision,input.pageId).run();
  if(result.meta.changes!==1)throw Error("ORGANIZATION_V2_WRITE_CONFLICT");
}

async function pullLocation(input:OrganizationV2Scope,field:string,value:unknown,observed:Awaited<ReturnType<typeof observe>>) {
  if(!isOrganizationLocationV2Field(field) || typeof value!=="string" || !value.trim())throw Error("ORGANIZATION_V2_LOCATION_INVALID");
  if(observed.location?.google_current)throw Error("ORGANIZATION_V2_GOOGLE_LOCATION_LOCKED");
  const {database,entityId,pageId}=input;
  const column=ORGANIZATION_LOCATION_V2_COLUMNS[field];
  const loc=observed.location;
  const desired=normalizeOrganizationLocationAdminInput({
    role:loc?.role??"UNSPECIFIED",label:loc?.label??"",address:loc?.address??"",
    city:observed.source.properties["Mesto"]??"",district:observed.source.properties["Okres"]??"",
    region:observed.source.properties["Kraj"]??"",countryCode:loc?.country_code??"SK",
    isPrimary:loc?Boolean(loc.is_primary):true,sortOrder:loc?.sort_order??0,[column]:value,
  });
  if(desired[column]!==value)throw Error("ORGANIZATION_V2_LOCATION_NORMALIZATION_REVIEW");
  const parent=database.prepare("UPDATE help_organizations SET updated_at=?,updated_by=? "+
    "WHERE id=? AND updated_at=? AND archived_at IS NULL AND status<>'ARCHIVED' "+
    "AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='ORGANIZATION' AND entity_id=help_organizations.id) "+
    "AND NOT "+partnerReviewOwnerSql("ORGANIZATION","help_organizations.id")+" "+
    "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='organizations' AND record_id=help_organizations.id) "+
    "AND EXISTS(SELECT 1 FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=help_organizations.id AND notion_page_id=?)")
    .bind(nextOrganizationEditRevision(observed.revision,new Date()),ACTOR,entityId,observed.revision,pageId);
  const update=loc ? database.prepare("UPDATE organization_locations SET "+column+"=? "+
    "WHERE id=? AND organization_id=? AND id=("+selectedLocationSql+") "+
    "AND role IS ? AND label IS ? AND address IS ? AND city IS ? AND district IS ? AND region IS ? "+
    "AND country_code IS ? AND is_primary IS ? AND sort_order IS ? AND NOT "+currentGoogleSql)
    .bind(value,loc.id,entityId,entityId,loc.role,loc.label,loc.address,loc.city,loc.district,loc.region,
      loc.country_code,loc.is_primary,loc.sort_order)
    : database.prepare("INSERT INTO organization_locations(organization_id,role,label,address,city,district,region,country_code,is_primary,sort_order) "+
      "SELECT ?,'UNSPECIFIED','','',?,?,?,'SK',1,0 WHERE NOT EXISTS(SELECT 1 FROM organization_locations WHERE organization_id=?)")
      .bind(entityId,desired.city,desired.district,desired.region,entityId);
  const guard=database.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('ORGANIZATION_V2_LOCATION_CONFLICT','$') END");
  const result=await database.batch([parent,guard,update,guard]);
  const id=loc?.id??Number(result[2]?.meta.last_row_id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error("ORGANIZATION_V2_LOCATION_ID_MISSING");
  await reconcileGeoAfterSourceMutation({targetType:"ORGANIZATION_LOCATION",targetId:id,actorRef:ACTOR,actorType:"SYSTEM"},database);
}

export async function syncOrganizationV2Fields(input:OrganizationV2Scope & {
  fields:readonly string[]; direction:"pull"|"push";
  encode:(values:Record<string,ReconciliationValue>)=>Record<string,unknown>;
}) {
  const {database,entityId,pageId,direction}=input;
  const failed:string[]=[];
  let pulled=0,pushed=0;
  const fields=[...new Set(input.fields)];
  if(direction==="push" && fields.includes("Slug"))fields.splice(0,0,...fields.splice(fields.indexOf("Slug"),1));
  for(const field of fields) {
    try {
      if(!PROTECTED.has(field) && !isOrganizationV2Field(field) && !isOrganizationLocationV2Field(field))throw Error("ORGANIZATION_V2_UNKNOWN_FIELD");
      const slug=field==="Slug" && direction==="push";
      const observation=await observe(input,field,slug);
      const structural=PROTECTED.has(field) || Boolean(observation.location?.google_current);
      if(structural && direction==="pull") {
        if(observation.notion.present && observation.psipedia.present && observation.notion.value===observation.psipedia.value)continue;
        throw Error("ORGANIZATION_V2_CANONICAL_FIELD");
      }
      if(observation.archived && !(direction==="push" && field==="Stav"))
        throw Error("ORGANIZATION_V2_ARCHIVED");
      if(!observation.notion.present || !observation.psipedia.present)throw Error("ORGANIZATION_V2_FIELD_MISSING");
      const identity={agenda:"organizations" as const,entityId:String(entityId),pageId,field};
      const historical=await readProfileFieldBaseline({database,agenda:"organizations",entityId,pageId,expectedHash:observation.mapping.content_hash});
      const reservation=structural ? null : await reserveUnifiedField({
        database,identity,historicalBaseline:historical && Object.hasOwn(historical,field)
          ? {value:historical[field],version:observation.mapping.content_hash} : null,
        notion:observation.notion,psipedia:observation.psipedia,direction,
        psipediaEdit:await readUnifiedAdminEdit(database,identity,observation.revision),
      });
      if(!structural && !reservation)continue;
      const value=reservation ? reservation.value : observation.psipedia.value;
      if(direction==="pull"){
        const fresh=await observe(input,field,false);
        if(fresh.revision!==observation.revision || !fresh.notion.present || fresh.notion.value!==value ||
          !fresh.psipedia.present || fresh.psipedia.value!==observation.psipedia.value ||
          JSON.stringify(fresh.location)!==JSON.stringify(observation.location))
          throw Error("ORGANIZATION_V2_SOURCE_CHANGED");
        if(isOrganizationLocationV2Field(field))await pullLocation(input,field,value,fresh);
        else await pullScalar(input,field,value,observation.revision);
        pulled++;
      }else{
        const fresh=await observe(input,field,slug);
        if(fresh.revision!==observation.revision || !fresh.psipedia.present || fresh.psipedia.value!==value ||
          !fresh.notion.present || fresh.notion.value!==observation.notion.value ||
          fresh.page.last_edited_time!==observation.page.last_edited_time || JSON.stringify(fresh.location)!==JSON.stringify(observation.location))
          throw Error("ORGANIZATION_V2_SOURCE_CHANGED");
        const values:Record<string,ReconciliationValue>={[field]:value as ReconciliationValue};
        if(slug)values["URL Psipedia"]=fresh.source.url;
        const patch=input.encode(values);
        if(Object.keys(values).some(key=>!Object.hasOwn(patch,key)))throw Error("ORGANIZATION_V2_ENCODE_MISSING");
        await notionRequest(input.bindings,"/pages/"+encodeURIComponent(pageId),{method:"PATCH",body:JSON.stringify({properties:patch})});
        pushed++;
      }
      const verified=await observe(input,field,false);
      if(reservation)await confirmUnifiedField(database,reservation,verified.notion,verified.psipedia);
      else if(!verified.notion.present || !verified.psipedia.present || verified.notion.value!==verified.psipedia.value)
        throw Error("ORGANIZATION_V2_CANONICAL_VERIFY_FAILED");
    } catch(error) {
      failed.push(field);
      console.warn("ORGANIZATION_V2_FIELD_PENDING",entityId,field,error instanceof Error?error.message:"UNKNOWN");
    }
  }
  return {pulled,pushed,failed};
}

export async function recoverOrganizationV2Field(input:OrganizationV2Scope,field:string){
  if(!isOrganizationV2Field(field)&&!isOrganizationLocationV2Field(field))throw Error("ORGANIZATION_V2_RECOVERY_SCOPE");
  const observed=await observe(input,field,false);
  if(observed.archived||observed.location?.google_current)throw Error("ORGANIZATION_V2_RECOVERY_PROTECTED");
  const {database,entityId,pageId}=input;
  const historical=await readProfileFieldBaseline({database,agenda:"organizations",entityId,pageId,expectedHash:observed.mapping.content_hash});
  const identity={agenda:"organizations" as const,entityId:String(entityId),pageId,field};
  await reserveUnifiedField({database,identity,direction:"observe",notion:observed.notion,psipedia:observed.psipedia,
    historicalBaseline:historical&&Object.hasOwn(historical,field)?{value:historical[field],version:observed.mapping.content_hash}:null,
    psipediaEdit:await readUnifiedAdminEdit(database,identity,observed.revision)});
}
