import assert from "node:assert/strict";
import test from "node:test";
import {compareBreedSqlV2Detail} from "../lib/breed-sql-v2-preview.ts";

const legacy={
  id:22,
  fci_standard_json:'{"oci":"Tmavé"}',
  editorial_json:'{"overview":"Opis"}',
  seo_json:'{"title":"Psy","noindex":false}',
  related_breeds_json:"[33]",
};

test("production default: no flag means absolutely no v2 D1 queries",async()=>{
  let accessed=0;
  const forbidden={prepare(){accessed++;throw Error("0174_NOT_INSTALLED")}};
  await compareBreedSqlV2Detail(forbidden,legacy,{});
  await compareBreedSqlV2Detail(forbidden,legacy,{BREED_SQL_V2_COMPARE_MODE:"sql"});
  await compareBreedSqlV2Detail(forbidden,legacy,{BREED_SQL_V2_COMPARE_MODE:"true"});
  assert.equal(accessed,0);
});

test("opt-in compare reads four SQL slots but never changes the public result",async()=>{
  const selects=[];
  const db={
    prepare(query){selects.push(query);return {bind(id){assert.equal(id,22);return this}};},
    async batch(stmts){
      assert.equal(stmts.length,4);
      return [
        {results:[{fci_oci:"Tmavé"}]},
        {results:[{overview:"Opis"}]},
        {results:[{seo_title:"Psy",seo_noindex:0}]},
        {results:[{related_breed_id:33}]},
      ];
    },
  };
  const warnings=[];
  const original=console.warn;
  try{
    console.warn=(...args)=>warnings.push(args);
    const result=await compareBreedSqlV2Detail(db,legacy,{BREED_SQL_V2_COMPARE_MODE:"compare"});
    assert.equal(result,undefined);
  }finally{console.warn=original}
  assert.equal(selects.length,4);
  assert.ok(selects.every(x=>/^(SELECT|\s*SELECT)/.test(x)));
  assert.ok(warnings.length>=1); // unfilled 0174 fields are expected
  assert.equal(JSON.stringify(warnings).includes("Tmavé"),false);
  assert.equal(JSON.stringify(warnings).includes("Psy"),false);
});

test("missing 0174 schema is diagnostic only and cannot take public page down",async()=>{
  let reads=0;const db={prepare(){reads++;throw Error("no such table: breed_fci_standard")}};
  const warnings=[];const original=console.warn;
  try{
    console.warn=(...args)=>warnings.push(args);
    await assert.doesNotReject(compareBreedSqlV2Detail(db,legacy,
      {BREED_SQL_V2_COMPARE_MODE:"compare"}));
  }finally{console.warn=original}
  assert.equal(reads,1);
  assert.equal(warnings[0]?.[0],"breed_sql_v2_preview_unavailable");
  assert.equal(warnings[0]?.[1].breedId,22);
  assert.equal(warnings[0]?.[1].code,"Error");
  assert.equal(JSON.stringify(warnings).includes("no such table"),false);
});
