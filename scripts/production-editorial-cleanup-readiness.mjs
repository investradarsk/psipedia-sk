/**
 * Psipedia – SQL unification phase 4/4: fail-closed legacy cleanup assessment.
 *
 * This is an evidence report, NEVER a migration or permission to delete data.
 * It consumes ONLY aggregated, read-only production inventory; it cannot
 * certify Admin, public, Notion, or backup parity by design.
 *
 * No product URLs, names, raw JSON, identities or contacts are reported.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EDITORIAL_SQL_SCOPES = Object.freeze([
  "directory", "eshops", "events", "help-cases",
  "organizations", "adoptions", "lost-found",
]);
export const REQUIRED_DIRECTORY_CATEGORIES = Object.freeze([
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
]);
export const REQUIRED_SQL_TABLES = Object.freeze([
  "directory_profiles", "managed_eshops", "managed_events",
  "help_cases", "help_organizations", "adoption_dogs",
  "lost_found_dog_reports",
  "directory_notion_sync", "eshop_notion_sync", "event_notion_sync",
  "notion_agenda_sync", "service_catalog_admin_options",
  "service_profile_option_choices", "service_profile_property_values",
]);
const knownScope = new Set(EDITORIAL_SQL_SCOPES);
const validInt = value => typeof value === "number" &&
  Number.isSafeInteger(value) && value >= 0;
const signal = (code, detail) => ({code, detail});
const countSum = (rows, field) => rows.reduce(
  (n, row) => n + (validInt(row[field]) ? row[field] : 0), 0);

/**
 * Only trusted structural fields are read. A malformed or partial report
 * refuses to infer that a table has no legacy dependencies.
 */
export function assessEditorialCleanupReadiness(report) {
  const blockers=[];
  const warnings=[];
  if (!report || typeof report !== "object" || Array.isArray(report) ||
      report.readOnly !== true || report.database !== "psipedia-sk-db" ||
      !Array.isArray(report.byCategory) ||
      !Array.isArray(report.missingTables) ||
      !Array.isArray(report.orphanMappings) ||
      !Array.isArray(report.supportCounts) ||
      typeof report.executedAt !== "string" ||
      !Number.isFinite(Date.parse(report.executedAt))) {
    return {
      status:"blocked",canDeleteLegacyData:false,
      blockers:[signal("INVALID_AUDIT_EVIDENCE",
        "Require a valid production count-only D1 inventory artifact.")],
      warnings:[],summary:null,
    };
  }
  const missing=report.missingTables.filter(v=>typeof v==="string");
  if (missing.length!==report.missingTables.length)
    blockers.push(signal("UNTRUSTED_MISSING_TABLE_LIST",
      "Missing-table diagnostics are malformed."));
  const missingSet=new Set(missing);
  const countedTables=new Set(report.supportCounts.map(v=>v?.table));
  if (report.supportCounts.some(v=>!v || typeof v.table!=="string" ||
      !validInt(v.records) || !REQUIRED_SQL_TABLES.includes(v.table))) {
    blockers.push(signal("INVALID_SUPPORTING_COUNTS",
      "Supporting-table counts are incomplete or invalid."));
  }
  // Existence for the seven primary tables is represented by grouped data
  // and the missing-table list, not an assumed nonempty sample.
  const missingMain=REQUIRED_SQL_TABLES.slice(0,7).filter(t=>missingSet.has(t));
  if (missingMain.length)
    blockers.push(signal("MISSING_CANONICAL_SQL_TABLES",
      "Canonical tables missing: "+missingMain.join(", ")));
  const expectedSupporting=REQUIRED_SQL_TABLES.slice(7);
  const supportingMissing=expectedSupporting.filter(name=>
    !countedTables.has(name) && !missingSet.has(name));
  if (supportingMissing.length)
    blockers.push(signal("INCOMPLETE_SUPPORTING_SCHEMA_REPORT",
      "No presence/absence result: "+supportingMissing.join(", ")));
  const unavailableSupport=expectedSupporting.filter(t=>missingSet.has(t));
  if (unavailableSupport.length)
    blockers.push(signal("MISSING_RELATION_OR_NOTION_TABLES",
      "Required supporting tables missing: "+unavailableSupport.join(", ")));

  const groups=report.byCategory;
  if (groups.some(row=>!row || !knownScope.has(row.scope) ||
      typeof row.category!=="string" || typeof row.state!=="string" ||
      !validInt(row.records) ||
      (row.notionMapped!==null && !validInt(row.notionMapped)) ||
      (row.nonemptySourceJson!==null && !validInt(row.nonemptySourceJson)) ||
      (row.invalidSourceJson!==null && !validInt(row.invalidSourceJson)) ||
      (row.technicalJsonDependencies!==null && !validInt(row.technicalJsonDependencies)) ||
      (validInt(row.notionMapped) && row.notionMapped>row.records))) {
    blockers.push(signal("INVALID_CATEGORY_COUNTS",
      "Category inventory has unknown or invalid values."));
  }
  const dupe=new Set();
  for (const row of groups) {
    if (!row || typeof row.scope!=="string") continue;
    const key=JSON.stringify([row.scope,row.category,row.state]);
    if (dupe.has(key)) {
      blockers.push(signal("DUPLICATE_AGGREGATE_GROUP",
        "Inventory category/status groups are repeated."));
      break;
    }
    dupe.add(key);
  }
  const mappingUnknown=groups.filter(row=>row?.notionMapped===null);
  if (mappingUnknown.length)
    blockers.push(signal("NOTION_MAPPING_COVERAGE_UNKNOWN",
      "At least one D1 category/status group lacks mapping-table coverage."));
  const unmapped=groups.filter(row=>validInt(row?.notionMapped) &&
    validInt(row?.records) && row.notionMapped<row.records);
  if (unmapped.length)
    warnings.push(signal("UNMAPPED_RECORDS_PRESENT",
      "Some records lack a stored Notion mapping; inspect intent before claiming parity."));
  const nonempty=countSum(groups,"nonemptySourceJson");
  const invalid=countSum(groups,"invalidSourceJson");
  const technical=countSum(groups,"technicalJsonDependencies");
  if (nonempty>0)
    blockers.push(signal("LIVE_SOURCE_JSON_DEPENDENCIES",
      "Nonempty legacy/technical source JSON remains: "+nonempty+" grouped records."));
  if (invalid>0)
    blockers.push(signal("INVALID_LEGACY_JSON",
      "Malformed JSON present in "+invalid+" grouped records."));
  if (technical>0)
    blockers.push(signal("ACTIVE_TECHNICAL_JSON",
      "Technical Directory JSON required by current readers: "+technical+" grouped records."));

  const reportedOrphans=new Set();
  for (const row of report.orphanMappings) {
    if (!row || !knownScope.has(row.scope) ||
        !validInt(row.count) || reportedOrphans.has(row.scope)) {
      blockers.push(signal("INVALID_ORPHAN_MAPPING_AUDIT",
        "Orphan mapping counts are malformed or duplicated."));
      continue;
    }
    reportedOrphans.add(row.scope);
    if (row.count>0) blockers.push(signal("ORPHAN_NOTION_MAPPING",
      "Unresolved Notion links in "+row.scope+": "+row.count+"."));
  }
  // A genuinely absent mapping table legitimately has no orphan count,
  // but this must not be mistaken for successful mapping verification.
  for (const scope of EDITORIAL_SQL_SCOPES) {
    const rows=groups.filter(r=>r.scope===scope);
    if (!rows.length && missingMain.length===0)
      warnings.push(signal("NO_VISIBLE_GROUPS_"+scope.toUpperCase().replaceAll("-","_"),
        "No category/status rows for "+scope+"; verify whether this agenda is empty."));
    if (rows.some(r=>r.notionMapped!==null) && !reportedOrphans.has(scope))
      blockers.push(signal("MISSING_ORPHAN_CHECK_"+scope.toUpperCase().replaceAll("-","_"),
        "Orphan count not provided for "+scope+"."));
  }

  // These four independent real-world checks CANNOT be proven from summary
  // counts. Never turn an empty-JSON result into automatic DROP permission.
  blockers.push(signal("PRODUCTION_MIGRATION_NOT_ATTESTED",
    "Numbered migration and row-by-row backfill not proven applied to production."));
  blockers.push(signal("ADMIN_PUBLIC_PARITY_NOT_ATTESTED",
    "No all-category live Admin/public read and write comparison is attached."));
  blockers.push(signal("NOTION_BIDIRECTIONAL_PARITY_NOT_ATTESTED",
    "Notion field-level pull/push and reviewed-profile freeze are not proved."));
  blockers.push(signal("BACKUP_AND_ROLLBACK_NOT_ATTESTED",
    "No backup restore or rollback rehearsal is provided."));
  blockers.push(signal("LEGACY_CODE_READERS_STILL_PRESENT",
    "Known Directory JSON readers/writers still exist; remove only after a coordinated cutover."));
  return {
    status:"blocked",canDeleteLegacyData:false,
    blockers,warnings,
    summary:{
      scopes:EDITORIAL_SQL_SCOPES.length,categoryGroups:groups.length,
      countedRows:countSum(groups,"records"),
      mappedRows:countSum(groups,"notionMapped"),
      nonemptySourceJsonRows:nonempty,
      invalidSourceJsonRows:invalid,
      technicalSourceJsonRows:technical,
      orphanNotionLinks:report.orphanMappings.reduce((n,r)=>n+(validInt(r?.count)?r.count:0),0),
      missingTableCount:missing.length,
    },
  };
}

/** Local/offline: read only the aggregate artifact, never Cloudflare or Notion. */
async function main() {
  const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
  const reportPath=process.argv[2]
    ? resolve(process.argv[2])
    : join(root,".production-editorial-storage-readonly/report.json");
  const outputPath=process.argv[3]
    ? resolve(process.argv[3])
    : join(root,".production-editorial-storage-readonly/cleanup-readiness.json");
  const report=JSON.parse(await readFile(reportPath,"utf8"));
  const assessment=assessEditorialCleanupReadiness(report);
  await mkdir(dirname(outputPath),{recursive:true});
  await writeFile(outputPath,JSON.stringify(assessment,null,2)+"\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines=[
      "### Final cleanup gate – Services / Help / Events",
      "",
      "**Destructive cleanup permitted: NO.** Aggregate counts alone cannot prove Notion or Admin/public field parity.",
      "",
      "| Gate | Result |",
      "| --- | --- |",
      ...assessment.blockers.map(x=>["| ",x.code," | BLOCKED |"].join("")),
      "",
      "Download cleanup-readiness.json for machine-readable issues and counts.",
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n");
  }
  process.stdout.write(JSON.stringify({status:assessment.status,
    destructiveCleanupAllowed:false,blockers:assessment.blockers.length,
    categoryGroups:assessment.summary?.categoryGroups??null})+"\n");
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    console.error("EDITORIAL_CLEANUP_GATE_FAILED",
      error instanceof Error?error.message:"UNEXPECTED");
    process.exitCode=1;
  });
}
