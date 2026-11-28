import { physicalBreedMediaValue, type VerifiedProfileMedia } from "./notion-profile-owned-media.ts";
import { breedOwnedMediaKey } from "./notion-breed-structured-authority.mjs";
import { breedAdminFieldReceipt } from "./notion-breed-admin-receipts.ts";
import { getManagedBreed, type ManagedBreed } from "@/lib/breed-store";
import { normalizeBreedSearchText } from "@/lib/breed-fci";
import { env } from "cloudflare:workers";
import { summarizeBreedSqlV2Write } from "@/lib/breed-sql-v2-bridge.mjs";
import {
  breedSqlV2DirectFieldStatements,breedSqlV2CasGuard,
} from "@/lib/breed-sql-v2-writer.mjs";
import { breedFieldSnapshot } from "@/lib/notion-breed-field-delta";
import {
  breedEventD1FieldPatch,breedEventNeedsSearchRefresh,
} from "@/lib/notion-breed-workcopy-field-sql.mjs";

const actor="notion-breed-sync@psipedia.sk";

function versionAfter(previous:string) {
  const millis=Date.parse(previous);
  return new Date(Math.max(Date.now(),Number.isFinite(millis)?millis+1:0)).toISOString();
}

function searchAfter(before:ManagedBreed,field:string,value:unknown) {
  if (!breedEventNeedsSearchRefresh(field)) return undefined;
  const fields={
    name:before.name,officialFciName:before.officialFciName,
    origin:before.origin,group:before.group,fciSection:before.fciSection,
    [field]:value,
  };
  return normalizeBreedSearchText([
    fields.name,fields.officialFciName,fields.origin,
    fields.group,fields.fciSection,
  ].map(v=>String(v??"")).join(" "));
}

/**
 * Breeder-style one-column D1 update, never a whole-breed PUT.
 * A concurrent Admin or Notion write is reread before retry; only the named
 * cell is allowed to change. Publication, slug and relation rows stay intact.
 */
export async function saveBreedNotionField(input:{
  database:D1Database;breedId:number;field:string;value:unknown;
  actor?:string;
  expectedRevision?:string;
  recordAdminReceipt?:boolean;
  authorityReservation?: import("./notion-unified-field-transfer.ts").FieldReservation;
  mediaProofs?:readonly VerifiedProfileMedia[];
}):Promise<{updated:boolean;breed:ManagedBreed}> {
  if (!Number.isSafeInteger(input.breedId) || input.breedId<1)
    throw Error("BREED_EVENT_PSI_ID_INVALID");
  for (let attempt=0;attempt<4;attempt++) {
    const before=await getManagedBreed(input.breedId);
    if (!before) throw Error("BREED_EVENT_PROFILE_NOT_FOUND");
    if (input.expectedRevision !== undefined && before.updatedAt !== input.expectedRevision)
      throw Error("BREED_UNIFIED_REVISION_CHANGED");
    const previous=input.field==="fciNumber"
      ?before.fciNumber
      :(breedFieldSnapshot(before) as Record<string,unknown>)[input.field];
    const media=input.authorityReservation?.profileAuthority&&(input.field==="image"||input.field==="gallery");
    const physical=media?physicalBreedMediaValue(input.field as "image"|"gallery",input.value,input.mediaProofs):input.value;
    if (JSON.stringify(previous)===JSON.stringify(physical)&&!(media&&input.field==="image"&&before.imageKey!==(input.mediaProofs?.[0]?.key??null)))
      return {updated:false,breed:before};
    const patch=breedEventD1FieldPatch(input.field,physical,
      searchAfter(before,input.field,physical));
    // Step 4/6: one shared routing plan for Admin and signed Notion events.
    // Never execute a second SQL write until 0174/backfill + atomic
    // per-field shadow-write transaction are verified in steps 5–6.
    if ((env as unknown as {BREED_SQL_V2_COMPARE_MODE?:string})
        .BREED_SQL_V2_COMPARE_MODE === "compare") {
      try {
        const preview=summarizeBreedSqlV2Write(input.field,input.value);
        if(preview)console.info("breed_sql_v2_write_route_preview",{
          breedId:input.breedId,...preview,
        });
      }catch(error){
        console.warn("breed_sql_v2_write_plan_unavailable",{
          breedId:input.breedId,field:input.field,
          code:error instanceof Error?error.name:"UNKNOWN",
        });
      }
    }
    const next=versionAfter(before.updatedAt);
    // SQL-primary FCI/editorial/SEO fields live in typed tables/columns.
    // CAS increments the parent revision, but must not touch stored legacy
    // JSON object blobs; the named SQL cell is updated in the SAME D1 batch.
    const sqlOnlyObjectField=/^(?:fciStandard|editorial|seo)\./.test(input.field);
    const assignments=sqlOnlyObjectField?[]:patch.assignments;
    const params=sqlOnlyObjectField?[]:patch.params;
    if(input.authorityReservation?.profileAuthority===true&&input.field==="image"){
      const key=physical===""?null:breedOwnedMediaKey(physical);
      if(physical!==""&&!key)throw Error("BREED_MEDIA_REVIEW_REQUIRED");
      const index=assignments.indexOf("image_key=NULL");
      if(index<0)throw Error("BREED_MEDIA_SQL_MAPPING_MISSING");
      assignments[index]="image_key=?";params.push(key);
    }
    const authority=input.authorityReservation?.profileAuthority===true;
    const guard=authority
      ? " AND status<>'archived' AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='BREED' AND entity_id=managed_breeds.id)"+
        " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=managed_breeds.id)"+
        " AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda='breeds' AND entity_id=CAST(managed_breeds.id AS TEXT))"+
        " AND EXISTS(SELECT 1 FROM breed_notion_workcopy_links WHERE breed_id=managed_breeds.id AND status='ACTIVE' AND work_notion_page_id=?)"+
        " AND EXISTS(SELECT 1 FROM notion_unified_field_state WHERE agenda='breeds' AND entity_id=CAST(managed_breeds.id AS TEXT) AND notion_page_id=? AND field_key=? AND version=? AND status='PENDING')"
      : "";
    const sql="UPDATE managed_breeds SET "+
      [...assignments,"updated_at=?","updated_by=?"].join(",")+
      " WHERE id=? AND updated_at=?"+guard+" RETURNING id";
    {
      // CAS + exactly one canonical SQL cell in ONE D1 transaction;
      // shadow mode additionally retains the old JSON object update.
      // The guard rolls back everything if an independent writer won.
      const statements=[
        input.database.prepare(sql)
          .bind(...params,next,input.actor??actor,input.breedId,before.updatedAt,
            ...(authority?[input.authorityReservation!.identity.pageId,input.authorityReservation!.identity.pageId,input.authorityReservation!.identity.field,input.authorityReservation!.version]:[])),
        breedSqlV2CasGuard(input.database),
        ...breedSqlV2DirectFieldStatements(input.database,input.breedId,
          input.field,physical),
        ...(input.recordAdminReceipt ? breedAdminFieldReceipt(input.database, {
          breedId: input.breedId, field: input.field, value: input.value, revision: next,
        }) : []),
      ];
      const result=await input.database.batch(statements);
      if(result[0]?.results?.length!==1)continue;
    }
    const breed=await getManagedBreed(input.breedId);
    if (!breed) throw Error("BREED_EVENT_RELOAD_FAILED");
    return {updated:true,breed};
  }
  throw Error("BREED_EVENT_CONCURRENT_EDIT");
}
