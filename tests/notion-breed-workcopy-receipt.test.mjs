import test from "node:test";
import assert from "node:assert/strict";
import { BREED_NOTION_EDITABLE_FIELDS } from "../lib/notion-breed-field-delta.ts";
import { isCompatibleBreedWorkcopyReceipt as compatible } from "../lib/notion-breed-workcopy-receipt.ts";
const complete = Object.fromEntries(BREED_NOTION_EDITABLE_FIELDS.map(field=>[
  field, field==="editorialComplete" || field==="seo.noindex" ? false : "",
]));
const receipt = (notion,admin) => "breed-field-v1:" + JSON.stringify({
  hash:"0".repeat(64), notion:JSON.stringify(notion),admin:JSON.stringify(admin),
});
test("accepts a complete compatible field-level receipt",()=>{
  assert.equal(compatible(receipt(complete,complete)),true);
});
test("rejects legacy SHA, absent and malformed receipts",()=>{
  assert.equal(compatible("0".repeat(64)),false);
  assert.equal(compatible(null),false);
  assert.equal(compatible("breed-field-v1:malformed"),false);
});
test("rejects a missing per-field baseline in either direction",()=>{
  assert.equal(compatible(receipt({intro:"intro"},complete)),false);
  assert.equal(compatible(receipt(complete,{intro:"intro"})),false);
});
