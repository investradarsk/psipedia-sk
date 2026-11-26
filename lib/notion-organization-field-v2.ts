import { ORGANIZATION_V2_COLUMNS, isOrganizationV2Field, nextOrganizationEditRevision } from "./notion-organization-admin-receipts.ts";
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

const PROTECTED = new Set(["Slug", "Stav", "Typ", "Mesto", "Okres", "Kraj"]);
const ACTOR = "notion-events-help-sync@psipedia.sk";

/** A missing or truncated property is not an observed empty value. */
export function organizationNotionObservation(page: NotionPage, field: string): FieldObservation {
  const property = page.properties?.[field] as Record<string, unknown> | undefined;
  if (!property || typeof property !== "object") return {present:false};
  const type = property.type;
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
type Scope = { database: D1Database; bindings: NotionSyncBindings; entityId:number; pageId:string; dataSourceId:string };
async function observe(input: Scope, field: string, allowSlugChange: boolean) {
  const {database,bindings,entityId,pageId,dataSourceId}=input;
  if(await isAdminNotionSyncLocked(database,"organizations",entityId) || await notionPageIsTombstoned(database,pageId))
    throw Error("ORGANIZATION_V2_LOCKED");
  const mapping=await database.prepare("SELECT notion_page_id,content_hash FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=?").bind(entityId).first<{notion_page_id:string;content_hash:string}>();
  if(mapping?.notion_page_id!==pageId)throw Error("ORGANIZATION_V2_MAPPING_CHANGED");
  const before=await database.prepare("SELECT updated_at,status,archived_at FROM help_organizations WHERE id=?").bind(entityId).first<{updated_at:string;status:string;archived_at:string|null}>();
  if(!before)throw Error("ORGANIZATION_V2_MISSING");
  const source=(await loadNotionBulkOrganizations(database,entityId)).find(record=>record.id===String(entityId));
  const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId));
  if(!source || page.id!==pageId || !notionPageBelongsToDataSource(page,dataSourceId))
    throw Error("ORGANIZATION_V2_SOURCE_CHANGED");
  const identity=organizationNotionObservation(page,"Psipedia ID");
  const url=organizationNotionObservation(page,"URL Psipedia");
  if(!identity.present || identity.value!==String(entityId) || !url.present || (!allowSlugChange && url.value!==source.url))
    throw Error("ORGANIZATION_V2_IDENTITY_CHANGED");
  const after=await database.prepare("SELECT updated_at FROM help_organizations WHERE id=?").bind(entityId).first<{updated_at:string}>();
  if(after?.updated_at!==before.updated_at)throw Error("ORGANIZATION_V2_REVISION_CHANGED");
  return {page,source,mapping,revision:before.updated_at,archived:before.status==="ARCHIVED"||!!before.archived_at,
    notion:organizationNotionObservation(page,field),
    psipedia:Object.hasOwn(source.properties,field) ? {present:true as const,value:source.properties[field]} : {present:false as const}};
}

async function pullScalar(input:Scope,field:string,value:unknown,revision:string) {
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

export async function syncOrganizationV2Fields(input:Scope & {
  fields:readonly string[]; direction:"pull"|"push";
  encode:(values:Record<string,ReconciliationValue>)=>Record<string,unknown>;
}) {
  const {database,entityId,pageId,direction}=input;
  const failed:string[]=[];
  let pulled=0,pushed=0;
  for(const field of [...new Set(input.fields)]) {
    try {
      const structural=PROTECTED.has(field);
      if(structural && direction==="pull")throw Error("ORGANIZATION_V2_CANONICAL_FIELD");
      if(!structural && !isOrganizationV2Field(field))throw Error("ORGANIZATION_V2_UNKNOWN_FIELD");
      const slug=field==="Slug" && direction==="push";
      const observation=await observe(input,field,slug);
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
        if(fresh.revision!==observation.revision || !fresh.notion.present || fresh.notion.value!==value)
          throw Error("ORGANIZATION_V2_SOURCE_CHANGED");
        await pullScalar(input,field,value,observation.revision);
        pulled++;
      }else{
        const fresh=await observe(input,field,slug);
        if(fresh.revision!==observation.revision || !fresh.psipedia.present || fresh.psipedia.value!==value ||
          !fresh.notion.present || fresh.notion.value!==observation.notion.value ||
          fresh.page.last_edited_time!==observation.page.last_edited_time)
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
