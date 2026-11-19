import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyDirectory0170Row, aggregateDirectory0170Rows } from "../scripts/directory-0170-backfill-readonly.mjs";

function row(extra={}) {
  return {
    id:1, category:"veterinari", status:"published", notion_mapped:1,
    source_data_json:"{}", website_url:null, public_phone:null, public_email:null,
    facebook_url:null, instagram_url:null,
    sql_categories:"[]",sql_facts:"[]",sql_filters:"[]",
    sql_services:"[]",sql_service_baseline:null,
    notion_page_id:"notion-page-1",sql_baseline_notion_page_id:null,...extra,
  };
}
test("legacy-only contact is unverified, not automatically safe to copy",()=>{
  const r=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify({"Telefón":"+421 900 123 123"}),
  }));
  assert(r.issues.includes("contact:public_phone_legacy_only_unverified"));
  assert.equal(r.mappedToNotion,true);
  assert(!JSON.stringify(r).includes("900 123"));
});
test("intentional canonical clear never resurrects an imported alias",()=>{
  const r=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify({"Telefón":"","Telefon":"private phone"}),
    public_phone:"",
  }));
  assert(r.issues.includes("contact:public_phone_cleared_legacy_alias_present"));
  assert(!r.issues.includes("contact:public_phone_legacy_only_unverified"));
  assert(!JSON.stringify(r).includes("private phone"));
});
test("SQL explicit blank against historical value is a conflict, not migration",()=>{
  const r=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify({"E-mail":"test@example.com"}),
    public_email:"",
  }));
  assert(r.issues.includes("contact:public_email_explicit_clear_vs_legacy"));
});
test("canonical website SQL is audited against both Web aliases, never backfilled automatically",()=>{
  const legacy = JSON.stringify({Web:"", "Webstránka":"https://historic.example.invalid"});
  const absent = classifyDirectory0170Row(row({source_data_json:legacy,website_url:null}));
  assert(absent.issues.includes("contact:website_url_cleared_legacy_alias_present"));
  assert(absent.issues.includes("contact:website_url_legacy_only_unverified"));
  const cleared = classifyDirectory0170Row(row({source_data_json:legacy,website_url:""}));
  assert(cleared.issues.includes("contact:website_url_explicit_clear_vs_legacy"));
  const changed = classifyDirectory0170Row(row({source_data_json:legacy,website_url:"https://current.example.invalid"}));
  assert(changed.issues.includes("contact:website_url_different"));
  const valid = classifyDirectory0170Row(row({website_url:"https://current.example.invalid"}));
  assert(!valid.issues.includes("contact:website_url_sql_only"), "SQL websites are canonical even without JSON");
  assert(!JSON.stringify({absent,cleared,changed,valid}).includes("historic.example"));
});

test("conflicting second website alias is detected even when first alias matches SQL",()=>{
  const result = classifyDirectory0170Row(row({
    website_url:"https://current.example.invalid",
    source_data_json:JSON.stringify({Web:"https://current.example.invalid","Webstránka":"https://stale.example.invalid"}),
  }));
  assert(result.issues.includes("contact:website_url_alias_conflict"));
  assert(!JSON.stringify(result).includes("stale.example"));
});

test("read-only inventory queries require website SQL column as one of five contacts",()=>{
  const code = readFileSync(new URL("../scripts/directory-0170-backfill-readonly.mjs",import.meta.url),"utf8");
  assert.match(code,/p\.source_data_json,p\.website_url,p\.public_phone/);
  assert.match(code,/\x27website_url\x27,\x27public_phone\x27,\x27public_email\x27,\x27facebook_url\x27,\x27instagram_url\x27/);
  assert.match(code,/must\(columns\.length === 6,"MISSING_COLUMNS"\)/);
});

test("secondary categories, facts and filters get independent review findings",()=>{
  const source={
    "_psipedia_additional_categories":JSON.stringify(["treneri"]),
    "Ordinačné hodiny":"Po-Pia",
    "_psipedia_filter_v1_veterinari_emergency":"yes",
  };
  const r=classifyDirectory0170Row(row({source_data_json:JSON.stringify(source)}));
  assert(r.issues.includes("category:legacy_only_unverified"));
  assert(r.issues.includes("fact:legacy_only_unverified"));
  assert(r.issues.includes("filter:legacy_only_unverified"));
});
test("reviewed and archived profiles are counted but not eligible for automatic backfill",()=>{
  const r=classifyDirectory0170Row(row({
    status:"archived",
    source_data_json:JSON.stringify({"_psipedia_profile_review_reviewed_at":"2026-11-18T10:00:00Z"}),
  }));
  assert(r.reviewed);
  assert(r.issues.includes("lifecycle:archived_no_backfill"));
  assert(r.issues.includes("lifecycle:reviewed_no_automatic_backfill"));
});
test("invalid JSON, unknown category and malformed relations are surfaced",()=>{
  const r=classifyDirectory0170Row(row({
    category:"unknown",source_data_json:"broken",sql_facts:"not-json",
  }));
  assert(r.issues.includes("source:invalid_json"));
  assert(r.issues.includes("source:unknown_primary_category"));
  assert(r.issues.includes("source:invalid_relation_aggregate"));
});
test("secondary category filter is recognized rather than marked unknown",()=>{
  const source = {
    "_psipedia_additional_categories":JSON.stringify(["fyzioterapia"]),
    "_psipedia_filter_v1_fyzioterapia_hydrotherapy":"yes",
  };
  const r=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify(source),
    sql_categories:JSON.stringify(["fyzioterapia"]),
    sql_filters:JSON.stringify([{
      category:"fyzioterapia",filter_id:"fyzioterapia.hydrotherapy",value_text:"yes",
    }]),
  }));
  assert(!r.issues.includes("filter:unknown_sql_id"));
  assert(!r.issues.includes("filter:category_mismatch"));
  assert(!r.issues.includes("filter:legacy_only_unverified"));
});
test("report contains only counts and sample IDs, never raw private field values",()=>{
  const rows=[
    row({id:17,source_data_json:JSON.stringify({"Telefón":"VERY-PRIVATE-001"})}),
    row({id:18,source_data_json:JSON.stringify({"E-mail":"PRIVATE@example.com"}),notion_mapped:0}),
  ];
  const report=aggregateDirectory0170Rows(rows);
  assert.equal(report.scanned,2);
  assert.equal(report.byCategory.veterinari.profiles,2);
  assert.equal(report.byCategory.veterinari.notionMapped,1);
  assert.equal(report.issues["contact:public_phone_legacy_only_unverified"],1);
  assert.equal(report.issuesByCategory.veterinari["contact:public_phone_legacy_only_unverified"],1);
  assert.equal(report.issuesByCategory.veterinari["contact:public_email_legacy_only_unverified"],1);
  assert.deepEqual(report.sampleProfileIds["contact:public_phone_legacy_only_unverified"],[17]);
  assert(!JSON.stringify(report).includes("VERY-PRIVATE"));
  assert(!JSON.stringify(report).includes("PRIVATE@example"));
});
test("field discrepancies are counted separately by Directory category",()=>{
  const results=aggregateDirectory0170Rows([
    row({id:1,category:"veterinari",website_url:"",source_data_json:JSON.stringify({Web:"https://old.example.invalid"})}),
    row({id:2,category:"treneri",website_url:null,source_data_json:JSON.stringify({"Webstránka":"https://other.example.invalid"})}),
  ]);
  assert.equal(results.issues["contact:website_url_explicit_clear_vs_legacy"],1);
  assert.equal(results.issues["contact:website_url_legacy_only_unverified"],1);
  assert.equal(results.issuesByCategory.veterinari["contact:website_url_explicit_clear_vs_legacy"],1);
  assert.equal(results.issuesByCategory.treneri["contact:website_url_legacy_only_unverified"],1);
  assert.equal(results.issuesByCategory.treneri["contact:website_url_explicit_clear_vs_legacy"],undefined);
  assert(!JSON.stringify(results).includes("other.example"));
});


test("step 5 V3 audit treats YES/NO as SQL, not legacy free-text services",()=>{
  const data=row({
    source_data_json:JSON.stringify({ Služby:"Old dog walking phrase",
      _psipedia_additional_categories_sql_confirmed:"1",
      _psipedia_additional_categories:"[]" }),
    sql_services:JSON.stringify([
      {option_id:"svc.builtin.example",choice:"yes",version:2},
      {option_id:"attr.builtin.example",choice:"no",version:1},
    ]),
    sql_service_baseline:JSON.stringify(["svc.builtin.example"]),
    sql_baseline_notion_page_id:"notion-page-1",
  });
  const result=classifyDirectory0170Row(data);
  assert(!result.issues.some(code=>code.startsWith("service:")),result.issues.join(","));
  assert(!JSON.stringify(result).includes("dog walking"));
});
test("step 5 audit classifies absent Notion baseline as unverified, never as a confirmed []",()=>{
  const result=classifyDirectory0170Row(row({
    sql_services:JSON.stringify([{option_id:"svc.test",choice:"yes",version:1}]),
    sql_service_baseline:null,
  }));
  assert(result.issues.includes("service:notion_baseline_missing_review"));
  assert(!result.issues.includes("service:notion_baseline_differs_review"));
});
test("step 5 audit detects V3 Notion baseline drift and wrong mapping without changing choices",()=>{
  const result=classifyDirectory0170Row(row({
    sql_services:JSON.stringify([{option_id:"svc.a",choice:"yes",version:2}]),
    sql_service_baseline:JSON.stringify(["svc.b"]),
    sql_baseline_notion_page_id:"different-page",
  }));
  assert(result.issues.includes("service:notion_baseline_differs_review"));
  assert(result.issues.includes("service:notion_baseline_mapping_mismatch"));
  assert(!JSON.stringify(result).includes("different-page"));
});
test("step 5 audit refuses malformed and duplicate V3 selections/baselines",()=>{
  const result=classifyDirectory0170Row(row({
    sql_services:JSON.stringify([
      {option_id:"svc.a",choice:"yes",version:1},
      {option_id:"svc.a",choice:"no",version:3},
      {option_id:"svc.b",choice:"sometimes",version:1},
    ]),
    sql_service_baseline:JSON.stringify(["svc.a","svc.a"]),
    sql_baseline_notion_page_id:"notion-page-1",
  }));
  assert(result.issues.includes("service:invalid_choice_row"));
  assert(result.issues.includes("service:invalid_notion_baseline"));
});
test("step 5 audit distinguishes confirmed SQL [] from historical absent categories",()=>{
  const noConfirmation=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify({_psipedia_additional_categories:"[]"}),
  }));
  assert(noConfirmation.issues.includes("category:sql_membership_unconfirmed"));
  const confirmed=classifyDirectory0170Row(row({
    source_data_json:JSON.stringify({
      _psipedia_additional_categories:"[]",
      _psipedia_additional_categories_sql_confirmed:"1",
    }),
  }));
  assert(!confirmed.issues.includes("category:sql_membership_unconfirmed"));
  assert(!confirmed.issues.includes("category:confirmed_empty_missing_source_evidence"));
});
test("read-only audit includes real V3 SQL selection and notion relation receipts",()=>{
  const source=readFileSync(new URL("../scripts/directory-0170-backfill-readonly.mjs",import.meta.url),"utf8");
  assert.match(source,/FROM service_profile_option_choices WHERE profile_id=p\.id/);
  assert.match(source,/FROM directory_service_notion_relation_sync WHERE directory_profile_id=p\.id/);
  assert.match(source,/sql_service_baseline/);
  assert.match(source,/v3NotionBaselineIsReceiptOnly:true/);
  assert.doesNotMatch(source,/fetch\(\s*["']https:\/\/api\.notion/);
});

test("audit script contains no database write commands or Notion API calls",()=>{
  const content=readFileSync(new URL("../scripts/directory-0170-backfill-readonly.mjs",import.meta.url),"utf8");
  assert.match(content,/DIRECTORY_0170_BACKFILL_CONFIRMATION/);
  assert.match(content,/SELECT_ONLY/);
  assert.doesNotMatch(content,/["'](?:d1 migrations apply|d1 time-travel restore)["']/);
  assert.doesNotMatch(content,/fetch\(\s*["']https:\/\/api\.notion/);
});
