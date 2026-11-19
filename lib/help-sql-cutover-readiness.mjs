/**
 * Step 6: pure, fail-closed Help SQL production readiness gate.
 *
 * This is a structural + aggregate-only assessment. It cannot validate live
 * Notion field values, permissions or public detail content. It never grants
 * authorization to DELETE legacy rows or execute the step-3 backfill.
 */
import { HELP_SQL_REQUIRED_COLUMNS } from "./help-sql-schema-preflight.mjs";

export const HELP_SQL_CUTOVER_AGENDAS = Object.freeze([
  "help-cases", "organizations", "adoptions", "lost-found",
]);
export const HELP_SQL_CUTOVER_EXTRA_SCHEMA = Object.freeze({
  admin_entity_reviews: Object.freeze(["entity_type","entity_id"]),
  partner_help_claims: Object.freeze([
    "status","adoption_dog_id","help_case_id","lost_found_report_id",
  ]),
  partner_resources: Object.freeze(["id","help_organization_id"]),
  partner_memberships: Object.freeze(["resource_id","revoked_at"]),
});
export const HELP_SQL_CUTOVER_SCHEMA = Object.freeze({
  ...HELP_SQL_REQUIRED_COLUMNS,
  ...HELP_SQL_CUTOVER_EXTRA_SCHEMA,
});
const validCount = n => Number.isSafeInteger(n) && n>=0;
const BLOCKED = "blocked";
const unique = codes => [...new Set(codes)];

export function assessHelpSqlCutover(input) {
  const { inventory, schema, recoveryCheckpoint, now, expectedSha } = input ?? {};
  const blockers=[];
  const warnings=[
    "Notion mapping counts never establish field-level parity.",
    "Legacy JSON columns in SQL may contain active galleries/SEO; this gate never deletes them.",
    "An intact D1 Time Travel bookmark is a recovery checkpoint, NOT an independent backup.",
    "Reviewed backfill receipts require separately approved manual action; no writes are authorized.",
  ];
  if (!inventory || inventory.readOnly!==true ||
      inventory.database!=="psipedia-sk-db" ||
      !Array.isArray(inventory.byCategory) || !Array.isArray(inventory.missingTables) ||
      !Array.isArray(inventory.orphanMappings) ||
      !Array.isArray(inventory.helpLegacyCoverage) ||
      !Array.isArray(inventory.helpLegacyFieldCandidates) ||
      !inventory.helpLegacyLostFoundCoverage) {
    blockers.push("INVENTORY_MISSING_OR_INVALID");
  }
  const auditAt=Date.parse(inventory?.executedAt);
  if (!Number.isFinite(auditAt) || !Number.isFinite(Date.parse(now)) ||
      Math.abs(Date.parse(now)-auditAt)>30*60*1000 ||
      typeof expectedSha!=="string" || !/^[a-f0-9]{40}$/.test(expectedSha) ||
      inventory.gitRevision!==expectedSha)
    blockers.push("INVENTORY_STALE_OR_COMMIT_MISMATCH");
  if (!schema || schema.ready!==true || !Array.isArray(schema.tables) ||
      Object.keys(HELP_SQL_CUTOVER_SCHEMA).some(name=>{
        const item=schema.tables.find(x=>x.table===name);
        return !item || item.exists!==true || !Array.isArray(item.missingColumns) ||
          item.missingColumns.length!==0;
      })) blockers.push("REQUIRED_HELP_SCHEMA_MISSING_OR_PARTIAL");
  if (recoveryCheckpoint!==true) blockers.push("RECOVERY_CHECKPOINT_UNAVAILABLE");
  if (inventory?.missingTables?.some(name => Object.hasOwn(HELP_SQL_CUTOVER_SCHEMA,name)))
    blockers.push("INVENTORY_MISSING_HELP_TABLES");

  const rows=Array.isArray(inventory?.byCategory)?inventory.byCategory:[];
  if (rows.some(row=>HELP_SQL_CUTOVER_AGENDAS.includes(row?.scope) &&
      (!validCount(row.records) || row.notionMapped!==null &&
       (!validCount(row.notionMapped)||row.notionMapped>row.records))))
    blockers.push("HELP_AGGREGATES_INVALID");
  if (rows.some(row=>HELP_SQL_CUTOVER_AGENDAS.includes(row?.scope) &&
      row.notionMapped===null))
    blockers.push("NOTION_MAPPING_COVERAGE_UNKNOWN");
  const mapping=Array.isArray(inventory?.orphanMappings)?inventory.orphanMappings:[];
  for (const agenda of HELP_SQL_CUTOVER_AGENDAS) {
    const hits=mapping.filter(x=>x?.scope===agenda);
    if (hits.length!==1 || !validCount(hits[0]?.count))
      blockers.push("NOTION_MAPPING_AUDIT_UNAVAILABLE");
    else if (hits[0].count!==0) blockers.push("NOTION_ORPHANS_REQUIRE_REVIEW");
  }

  const coverage=Array.isArray(inventory?.helpLegacyCoverage)?inventory.helpLegacyCoverage:[];
  const categories=["adopcia","utulky"];
  if (coverage.length!==categories.length ||
      categories.some(category=>{
        const found=coverage.filter(x=>x?.category===category);
        return found.length!==1 || found[0].status!=="aggregate_only" ||
          !validCount(found[0].legacyTotal) || !validCount(found[0].matched) ||
          !validCount(found[0].unmatched) ||
          found[0].matched+found[0].unmatched!==found[0].legacyTotal;
      }))
    blockers.push("HISTORICAL_ADOPTION_OR_SHELTER_COVERAGE_UNKNOWN");
  else if (coverage.some(x=>x.unmatched>0))
    blockers.push("HISTORICAL_ADOPTION_OR_SHELTER_NOT_MATCHED");

  const lost=inventory?.helpLegacyLostFoundCoverage;
  if (!lost || lost.status!=="requires_manual_type_review" ||
      !["legacyTotal","noSlugMatch","needsTypeReview","ambiguousTypeMatch"].every(k=>validCount(lost[k])) ||
      lost.noSlugMatch+lost.needsTypeReview+lost.ambiguousTypeMatch!==lost.legacyTotal)
    blockers.push("HISTORICAL_LOST_FOUND_COVERAGE_UNKNOWN");
  else if (lost.legacyTotal>0)
    blockers.push("HISTORICAL_LOST_FOUND_REQUIRES_TYPE_AND_URL_REVIEW");

  const candidates=Array.isArray(inventory?.helpLegacyFieldCandidates)
    ? inventory.helpLegacyFieldCandidates:[];
  if (candidates.length!==6 || candidates.some(x=>
      !["adoptions","organizations"].includes(x.agenda) ||
      !["main_image","image_url","short_description","description"].includes(x.field) ||
      x.status!=="candidate_counts_only" ||
      !validCount(x.joinedPairs) || !validCount(x.potentialMissing) ||
      !validCount(x.differentNonempty) ||
      x.potentialMissing+x.differentNonempty>x.joinedPairs) ||
      new Set(candidates.map(x=>x.agenda+":"+x.field)).size!==6)
    blockers.push("FIELD_CANDIDATE_INVENTORY_UNAVAILABLE");
  else {
    const expected=[
      "adoptions:main_image","adoptions:short_description","adoptions:description",
      "organizations:image_url","organizations:short_description","organizations:description",
    ];
    if (expected.some(key=>!candidates.some(c=>c.agenda+":"+c.field===key)))
      blockers.push("FIELD_CANDIDATE_INVENTORY_UNAVAILABLE");
    if (candidates.some(x=>x.potentialMissing>0))
      blockers.push("HISTORICAL_PUBLIC_FIELDS_REQUIRE_EXPLICIT_REVIEW");
    if (candidates.some(x=>x.differentNonempty>0))
      warnings.push("Some nonempty historical values disagree with SQL; do not overwrite newer editorial content.");
  }
  const reasons=unique(blockers);
  return {
    status:reasons.length?"blocked":"structural_check_passed",
    canDeleteLegacy:false, canApplyBackfill:false,
    productionDataModified:false,
    fieldLevelNotionParityVerified:false,
    publicUrlParityVerified:false,
    recoveryCheckpointVerified:recoveryCheckpoint===true,
    blockers:reasons,warnings,
    summary:{
      legacyAdoptionRecords:validCount(coverage.find(x=>x?.category==="adopcia")?.legacyTotal)
        ? coverage.find(x=>x.category==="adopcia").legacyTotal:null,
      legacyShelterRecords:validCount(coverage.find(x=>x?.category==="utulky")?.legacyTotal)
        ? coverage.find(x=>x.category==="utulky").legacyTotal:null,
      legacyLostFoundRecords:validCount(lost?.legacyTotal)?lost.legacyTotal:null,
      potentialMissingFields: candidates.length===6 && candidates.every(x=>validCount(x.potentialMissing))
        ? candidates.reduce((sum,x)=>sum+x.potentialMissing,0):null,
      helpNotionOrphans: mapping.filter(x=>HELP_SQL_CUTOVER_AGENDAS.includes(x.scope) &&
        validCount(x.count)).reduce((sum,x)=>sum+x.count,0),
    },
  };
}
