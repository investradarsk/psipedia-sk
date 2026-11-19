import { getManagedBreed, type ManagedBreed } from "@/lib/breed-store";
import { normalizeBreedSearchText } from "@/lib/breed-fci";
import { env } from "cloudflare:workers";
import { summarizeBreedSqlV2Write } from "@/lib/breed-sql-v2-bridge.mjs";
import {
  breedSqlV2ShadowEnabled,breedSqlV2DirectFieldStatements,breedSqlV2CasGuard,
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
}):Promise<{updated:boolean;breed:ManagedBreed}> {
  if (!Number.isSafeInteger(input.breedId) || input.breedId<1)
    throw Error("BREED_EVENT_PSI_ID_INVALID");
  for (let attempt=0;attempt<4;attempt++) {
    const before=await getManagedBreed(input.breedId);
    if (!before) throw Error("BREED_EVENT_PROFILE_NOT_FOUND");
    const previous=input.field==="fciNumber"
      ?before.fciNumber
      :(breedFieldSnapshot(before) as Record<string,unknown>)[input.field];
    if (JSON.stringify(previous)===JSON.stringify(input.value))
      return {updated:false,breed:before};
    const patch=breedEventD1FieldPatch(input.field,input.value,
      searchAfter(before,input.field,input.value));
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
    const sql="UPDATE managed_breeds SET "+patch.assignments.join(",")+
      ",updated_at=?,updated_by=? WHERE id=? AND updated_at=? RETURNING id";
    if(breedSqlV2ShadowEnabled(env)){
      // CAS + legacy JSON + the exact SQL v2 cell in ONE D1 transaction.
      // The guard rolls back everything if an independent writer won.
      const statements=[
        input.database.prepare(sql)
          .bind(...patch.params,next,input.actor??actor,input.breedId,before.updatedAt),
        breedSqlV2CasGuard(input.database),
        ...breedSqlV2DirectFieldStatements(input.database,input.breedId,
          input.field,input.value),
      ];
      const result=await input.database.batch(statements);
      if(result[0]?.results?.length!==1)continue;
    }else{
      const result=await input.database.prepare(sql)
        .bind(...patch.params,next,input.actor??actor,input.breedId,before.updatedAt)
        .first<{id:number}>();
      if (!result) continue; // Independent legitimate writer won this version.
    }
    const breed=await getManagedBreed(input.breedId);
    if (!breed) throw Error("BREED_EVENT_RELOAD_FAILED");
    return {updated:true,breed};
  }
  throw Error("BREED_EVENT_CONCURRENT_EDIT");
}
