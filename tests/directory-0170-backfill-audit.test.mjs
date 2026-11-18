import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyDirectory0170Row, aggregateDirectory0170Rows } from "../scripts/directory-0170-backfill-readonly.mjs";

function row(extra={}) {
  return {
    id:1, category:"veterinari", status:"published", notion_mapped:1,
    source_data_json:"{}", public_phone:null, public_email:null,
    facebook_url:null, instagram_url:null,
    sql_categories:"[]",sql_facts:"[]",sql_filters:"[]",...extra,
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
  assert.deepEqual(report.sampleProfileIds["contact:public_phone_legacy_only_unverified"],[17]);
  assert(!JSON.stringify(report).includes("VERY-PRIVATE"));
  assert(!JSON.stringify(report).includes("PRIVATE@example"));
});
test("audit script contains no database write commands or Notion API calls",()=>{
  const content=readFileSync(new URL("../scripts/directory-0170-backfill-readonly.mjs",import.meta.url),"utf8");
  assert.match(content,/DIRECTORY_0170_BACKFILL_CONFIRMATION/);
  assert.match(content,/SELECT_ONLY/);
  assert.doesNotMatch(content,/["'](?:d1 migrations apply|d1 time-travel restore)["']/);
  assert.doesNotMatch(content,/fetch\(\s*["']https:\/\/api\.notion/);
});
