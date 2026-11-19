/**
 * Staged 6/6 breed v2 per-field write-through plans.
 * Off by default. A caller must execute this inside the SAME D1.batch
 * transaction as the legacy CAS UPDATE and a changes() CAS assertion.
 *
 * Only allowlisted SQL column/table destinations are interpolated into SQL.
 * A missing v2 target row is an error; never silently save only legacy JSON.
 */
import {planBreedSqlV2FieldWrite} from "./breed-sql-v2-bridge.mjs";

export function breedSqlV2ShadowWriteEnabled(bindings) {
  return bindings?.BREED_SQL_V2_SHADOW_WRITE_MODE==="shadow";
}
const allowedTable=new Set([
  "breed_fci_standard","breed_editorial_text","breed_public_facts",
]);
export function planBreedSqlV2ShadowFieldStatements(breedId,field,value) {
  if(!Number.isSafeInteger(breedId)||breedId<1)
    throw Error("BREED_V2_SHADOW_BREED_ID_INVALID");
  const plan=planBreedSqlV2FieldWrite(field,value);
  if(!plan)return []; // Already-native old scalar or unsupported Notion field.
  if(plan.kind==="relations")
    throw Error("BREED_V2_SHADOW_RELATIONS_NEED_ATOMIC_FULL_SAVE");
  if(typeof plan.column!=="string"||
     !/^[a-z][a-z0-9_]*$/.test(plan.column))
    throw Error("BREED_V2_SHADOW_COLUMN_INVALID");
  if(plan.table==="managed_breeds") {
    // Only 0174 SEO columns require a second write. Other managed_breeds
    // scalar columns are already the canonical field in the CAS update.
    if(!plan.column.startsWith("seo_"))return [];
    return [{
      sql:`UPDATE managed_breeds SET ${plan.column}=? WHERE id=?`,
      params:[plan.stored,breedId],
    }];
  }
  if(!allowedTable.has(plan.table))
    throw Error("BREED_V2_SHADOW_TABLE_INVALID");
  return [{
    sql:`UPDATE ${plan.table} SET ${plan.column}=? WHERE breed_id=?`,
    params:[plan.stored,breedId],
  }];
}
export const BREED_V2_SHADOW_REQUIRE_CHANGED=
  "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('BREED_V2_SHADOW_CAS_OR_ROW_MISSING', '$') END AS guard";

export function breedSqlV2ShadowStatementsForD1(database,breedId,field,value) {
  const statements=planBreedSqlV2ShadowFieldStatements(breedId,field,value);
  return statements.flatMap(({sql,params})=>[
    database.prepare(sql).bind(...params),
    database.prepare(BREED_V2_SHADOW_REQUIRE_CHANGED),
  ]);
}
