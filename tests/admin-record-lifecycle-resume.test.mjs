import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the real removeRecord implementation with controlled D1/Notion service
// boundaries. In particular, test the ORDER of the re-hide and remote trash.
const source=readFileSync(fileURLToPath(new URL("../lib/admin-record-lifecycle.ts",import.meta.url)),"utf8");
const start=source.indexOf("export async function removeRecord(");
assert.ok(start>0);
const js=ts.transpileModule(source.slice(start),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function fixture(options={}) {
  const calls=[];
  const data={
    kind:"events",record_id:14,record_slug:"skusobne-podujatie",
    record_name:"Skúšobné podujatie",record_category:"výstava",
    notion_page_id:"page-1",notion_targets_json:JSON.stringify([{pageId:"page-1",sourceId:"db-1"}]),
    state:options.state??"ERROR_NOTION",error_code:null,
  };
  const row={id:14,slug:data.record_slug,title:data.record_name,event_type:data.record_category,
    status:options.status??"published"};
  const database={
    prepare(sql) {
      const statement={
        bind(...params) {
          return {
            async run() {
              calls.push({step:"d1-hide",sql,params});
              return {meta:{changes:options.hideFails?0:1}};
            },
          };
        },
      };
      return statement;
    },
  };
  const globals={
    exports:{}, Error, Promise, JSON, Date, Number,
    tombstone:async()=>data,
    canonical:async()=>row,
    identity:(_kind,value)=>({kind:"events",slug:value.slug,name:value.title,
      category:value.event_type,status:value.status}),
    specs:{events:{table:"managed_events",draft:"draft"}},
    clean:value=>value==null?"":String(value).trim(),
    verifyTrash:async()=>{calls.push({step:"notion-trash"});},
    completeLocalRemoval:async()=>{calls.push({step:"d1-delete"});},
    removeExclusiveMedia:async()=>({removed:0,preserved:0}),
    mediaKeys:()=>[],
    setRemovalError:async()=>{calls.push({step:"notion-error"});},
  };
  runInNewContext(js,globals,{timeout:1200});
  return {
    calls,
    remove:()=>globals.exports.removeRecord(database,{},"events",14,"admin@example.invalid",false,
      {slug:data.record_slug,name:data.record_name,category:data.record_category}),
    prior:data,row,
  };
}
test("a resumed ERROR_NOTION deletion re-hides D1 before remote trash",async()=>{
  const f=fixture({state:"ERROR_NOTION",status:"published"});
  assert.equal((await f.remove()).state,"COMPLETE");
  assert.deepEqual(f.calls.map(item=>item.step),["d1-hide","notion-trash","d1-delete"]);
});
test("READY_LOCAL replay re-hides the record but never contacts Notion again",async()=>{
  const f=fixture({state:"READY_LOCAL",status:"published"});
  assert.equal((await f.remove()).state,"COMPLETE");
  assert.deepEqual(f.calls.map(item=>item.step),["d1-hide","d1-delete"]);
});
test("failed re-hide aborts before both remote Notion and local hard deletion",async()=>{
  const f=fixture({state:"ERROR_NOTION",status:"published",hideFails:true});
  await assert.rejects(f.remove(),/RECORD_HIDE_NOT_CONFIRMED/);
  assert.deepEqual(f.calls.map(item=>item.step),["d1-hide"]);
});
test("a changed tombstone identity aborts a resumed request without writes",async()=>{
  const f=fixture({state:"ERROR_NOTION"});
  f.prior.record_name="Different entity";
  await assert.rejects(f.remove(),/RECORD_CONFIRMATION_MISMATCH/);
  assert.deepEqual(f.calls,[]);
});
