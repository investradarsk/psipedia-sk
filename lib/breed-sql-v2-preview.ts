/**
 * Plemená 4/6: guarded, read-only v2 D1 parity probe for Admin + public detail.
 *
 * Production behavior unchanged: no queries to 0174 tables unless the
 * explicit BREED_SQL_V2_COMPARE_MODE="compare" binding is enabled after
 * schema-only installation. Never replace the public result in step 4.
 */
import {
  breedSqlV2CompareEnabled,
  compareBreedSqlV2Rows,
} from "./breed-sql-v2-bridge.mjs";

export async function compareBreedSqlV2Detail(database:D1Database,
  row:{id:number;fci_standard_json:string;editorial_json:string;seo_json:string;related_breeds_json:string},
  bindings:{BREED_SQL_V2_COMPARE_MODE?:string}):Promise<void>{
  if(!breedSqlV2CompareEnabled(bindings)) return;
  try{
    const statements=[
      database.prepare("SELECT * FROM breed_fci_standard WHERE breed_id=? LIMIT 1").bind(row.id),
      database.prepare("SELECT * FROM breed_editorial_text WHERE breed_id=? LIMIT 1").bind(row.id),
      database.prepare("SELECT seo_title,seo_description,seo_focus_keyword,seo_canonical_url,seo_og_title,seo_og_description,seo_noindex FROM managed_breeds WHERE id=? LIMIT 1").bind(row.id),
      database.prepare("SELECT related_breed_id FROM breed_related_breeds WHERE breed_id=? ORDER BY position").bind(row.id),
    ];
    const results=await database.batch(statements);
    const stats=compareBreedSqlV2Rows(row,{
      fci:results[0].results?.[0]??null,
      editorial:results[1].results?.[0]??null,
      seo:results[2].results?.[0]??null,
      related:results[3].results??[],
    });
    // Only counters, never the full editorial/SEO data in logs.
    if(stats.different>0 || stats.unfilled>0 || stats.missingRows>0)
      console.warn("breed_sql_v2_parity_incomplete",stats);
  }catch(error){
    // This is a diagnostics-only read. Fail legacy-safe and reveal no content.
    console.warn("breed_sql_v2_preview_unavailable",{
      breedId:row.id,code:error instanceof Error?error.name:"UNKNOWN",
    });
  }
}
