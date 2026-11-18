import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assessEditorialCleanupReadiness,
  EDITORIAL_SQL_SCOPES,
  REQUIRED_DIRECTORY_CATEGORIES,
  REQUIRED_SQL_TABLES,
} from "../scripts/production-editorial-cleanup-readiness.mjs";

function cleanReport() {
  const toState=scope=>({
    scope,category:scope==="directory"?"veterinari":scope,state:"published",
    records:1,notionMapped:1,nonemptySourceJson:scope==="directory"?0:null,
    invalidSourceJson:scope==="directory"?0:null,
    technicalJsonDependencies:scope==="directory"?0:null,
  });
  return {
    executedAt:"2026-11-17T21:00:00.000Z",database:"psipedia-sk-db",
    readOnly:true,missingTables:[],
    byCategory:EDITORIAL_SQL_SCOPES.map(toState),
    orphanMappings:EDITORIAL_SQL_SCOPES.map(scope=>({scope,count:0})),
    supportCounts:REQUIRED_SQL_TABLES.slice(7).map(table=>({table,records:1})),
  };
}
const codes=assessment=>new Set(assessment.blockers.map(b=>b.code));

test("never give destructive cleanup permission merely because aggregates look clean",()=>{
  const result=assessEditorialCleanupReadiness(cleanReport());
  assert.equal(result.status,"blocked");
  assert.equal(result.canDeleteLegacyData,false);
  assert.equal(result.summary.scopes,7);
  assert.equal(result.summary.countedRows,7);
  for(const reason of [
    "PRODUCTION_MIGRATION_NOT_ATTESTED",
    "ADMIN_PUBLIC_PARITY_NOT_ATTESTED",
    "NOTION_BIDIRECTIONAL_PARITY_NOT_ATTESTED",
    "BACKUP_AND_ROLLBACK_NOT_ATTESTED",
    "LEGACY_CODE_READERS_STILL_PRESENT",
  ]) assert.ok(codes(result).has(reason),reason);
});

test("unknown mapping is NOT zero; partial/missing inventory cannot greenlight deletion",()=>{
  for(const bad of [null,{},[],{readOnly:false,database:"psipedia-sk-db"},
    {...cleanReport(),database:"other-db"},
    {...cleanReport(),byCategory:null},
    {...cleanReport(),executedAt:"not-a-date"},
  ]) {
    const result=assessEditorialCleanupReadiness(bad);
    assert.equal(result.canDeleteLegacyData,false);
    assert.ok(codes(result).has("INVALID_AUDIT_EVIDENCE"));
  }
  const report=cleanReport();
  report.byCategory[0].notionMapped=null;
  const assessed=assessEditorialCleanupReadiness(report);
  assert.ok(codes(assessed).has("NOTION_MAPPING_COVERAGE_UNKNOWN"));
  assert.equal(assessed.summary.mappedRows,6);
});

test("nonempty source JSON, technical keys, invalid JSON and orphan links each block cleanup",()=>{
  const report=cleanReport();
  Object.assign(report.byCategory[0],{
    records:10,notionMapped:9,nonemptySourceJson:5,
    invalidSourceJson:1,technicalJsonDependencies:3,
  });
  report.orphanMappings[0].count=2;
  const result=assessEditorialCleanupReadiness(report);
  for(const code of [
    "LIVE_SOURCE_JSON_DEPENDENCIES","INVALID_LEGACY_JSON",
    "ACTIVE_TECHNICAL_JSON","ORPHAN_NOTION_MAPPING",
  ]) assert.ok(codes(result).has(code),code);
  assert.equal(result.summary.nonemptySourceJsonRows,5);
  assert.equal(result.summary.invalidSourceJsonRows,1);
  assert.equal(result.summary.technicalSourceJsonRows,3);
  assert.equal(result.summary.orphanNotionLinks,2);
  assert.ok(result.warnings.some(w=>w.code==="UNMAPPED_RECORDS_PRESENT"));
});

test("a missing D1 relation or main table blocks instead of treating it as empty",()=>{
  const report=cleanReport();
  report.missingTables.push("directory_notion_sync","managed_events");
  report.supportCounts=report.supportCounts.filter(v=>v.table!=="directory_notion_sync");
  const assessed=assessEditorialCleanupReadiness(report);
  assert.ok(codes(assessed).has("MISSING_RELATION_OR_NOTION_TABLES"));
  assert.ok(codes(assessed).has("MISSING_CANONICAL_SQL_TABLES"));
  assert.equal(assessed.canDeleteLegacyData,false);
});

test("missing or duplicate orphan/link audit fails closed",()=>{
  const report=cleanReport();
  report.orphanMappings.splice(1,1);
  const result=assessEditorialCleanupReadiness(report);
  assert.ok([...codes(result)].some(x=>x.startsWith("MISSING_ORPHAN_CHECK_")));
  report.orphanMappings.push(report.orphanMappings[0]);
  const result2=assessEditorialCleanupReadiness(report);
  assert.ok(codes(result2).has("INVALID_ORPHAN_MAPPING_AUDIT"));
});

test("invalid totals, duplicate category/status groups or malformed support counts do not pass",()=>{
  const report=cleanReport();
  report.byCategory[0].records=-1;
  report.byCategory.push({...report.byCategory[1]});
  report.supportCounts[0].records="unknown";
  const result=assessEditorialCleanupReadiness(report);
  for(const code of [
    "INVALID_CATEGORY_COUNTS","DUPLICATE_AGGREGATE_GROUP",
    "INVALID_SUPPORTING_COUNTS",
  ]) assert.ok(codes(result).has(code),code);
});


test("valid optional service-catalog attempts from the real D1 inventory do not create a false blocker",()=>{
  const report=cleanReport();
  report.supportCounts.push({table:"service_catalog_notion_auto_attempts",records:51});
  report.supportCounts.find(x=>x.table==="service_profile_property_values").records=0;
  const assessed=assessEditorialCleanupReadiness(report);
  assert.equal(codes(assessed).has("INVALID_SUPPORTING_COUNTS"),false);
  assert.equal(assessed.status,"blocked");
  assert.equal(assessed.canDeleteLegacyData,false);
  assert.ok(codes(assessed).has("BACKUP_AND_ROLLBACK_NOT_ATTESTED"));
});

test("unknown, duplicate and malformed supporting-table aggregates still fail closed",()=>{
  for(const record of [
    {table:"unexpected_support_table",records:1},
    {table:"service_catalog_notion_auto_attempts",records:-1},
    {table:"service_catalog_notion_auto_attempts",records:"unknown"},
  ]){
    const report=cleanReport();report.supportCounts.push(record);
    assert.ok(codes(assessEditorialCleanupReadiness(report)).has("INVALID_SUPPORTING_COUNTS"));
  }
  const report=cleanReport();report.supportCounts.push({...report.supportCounts[0]});
  assert.ok(codes(assessEditorialCleanupReadiness(report)).has("INVALID_SUPPORTING_COUNTS"));
});

test("scope boundaries cover all ten Directory categories, five Help agendas, Events and e-shops",()=>{
  assert.deepEqual(REQUIRED_DIRECTORY_CATEGORIES,[
    "veterinari","treneri","kynologicke-kluby","chovatelske-kluby",
    "chovatelske-stanice","salony-a-sluzby","hotely-a-opatrovanie",
    "vencenie","fyzioterapia","dalsie-sluzby",
  ]);
  assert.deepEqual(EDITORIAL_SQL_SCOPES,[
    "directory","eshops","events","help-cases",
    "organizations","adoptions","lost-found",
  ]);
  assert.equal(new Set(REQUIRED_SQL_TABLES).size,REQUIRED_SQL_TABLES.length);
});

test("cleanup gate has no D1 credential flow or destructive SQL",()=>{
  const js=readFileSync(fileURLToPath(new URL(
    "../scripts/production-editorial-cleanup-readiness.mjs",import.meta.url)),
    "utf8");
  assert.doesNotMatch(js,/\b(?:wrangler|CLOUDFLARE_API_TOKEN|database\.prepare|database\.batch)\b/);
  assert.doesNotMatch(js,/\b(?:DROP TABLE|DELETE FROM|ALTER TABLE|TRUNCATE TABLE)\b/);
  assert.match(js,/canDeleteLegacyData:false/);
});
