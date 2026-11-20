import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
function harness() {
  const sqlite=new DatabaseSync(":memory:");
  const state={value:"Max",remote:"Max",writes:[],result:"synced",locked:false};
  const db={
    prepare(sql) {
      return {
        bind(...values) {
          const stmt=sqlite.prepare(sql);
          return {
            first:async()=>stmt.get(...values)??null,
            run:async()=>({meta:{changes:stmt.run(...values).changes}}),
            all:async()=>({results:stmt.all(...values)}),
          };
        },
      };
    },
  };
  const mocks={
    "./admin-notion-review-lock":{isAdminNotionSyncLocked:async()=>state.locked},
    "./notion-bulk-sources":{
      loadNotionBulkAdoptions:async(_db,id)=>[{id:String(id),properties:{Meno:state.value}}],
      loadNotionBulkOrganizations:async(_db,id)=>[{id:String(id),properties:{Názov:state.value}}],
      loadNotionBulkHelpCases:async(_db,id)=>[{id:String(id),properties:{Názov:state.value}}],
      loadNotionBulkLostFound:async(_db,id)=>[{id:String(id),properties:{"Meno psa":state.value}}],
    },
    "./notion-events-help-sync":{pageProperty:(page,name)=>page.properties[name]??""},
    "./notion-sync-shared":{notionRequest:async()=>({id:"page-1",properties:{Meno:state.remote,Názov:state.remote,"Meno psa":state.remote}})},
    "./notion-targeted-admin-help":{syncOneAdminHelpRecord:async input=>{
      state.writes.push(input);
      if(state.result==="synced")state.remote=state.value;
      return state.result;
    }},
  };
  return {sqlite,db,state,mocks};
}
async function setup() {
  const h=harness();
  h.sqlite.exec(await read("drizzle/0176_notion_help_admin_writeback_outbox.sql"));
  h.sqlite.exec("CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,PRIMARY KEY(agenda,entity_id))");
  h.sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("adoptions",7,"page-1");
  const code=await read("lib/notion-help-admin-outbox.ts");
  const compiled=ts.transpileModule(code,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const module={exports:{}};
  runInNewContext(compiled,{
    exports:module.exports,require(id){
      if(!h.mocks[id])throw Error("unexpected import: "+id);
      return h.mocks[id];
    },Date,JSON,Math,Object,Number,Set,String,
  });
  return {...h,api:module.exports,bindings:{NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED:"true"}};
}
function queuedCount(sqlite) {
  return sqlite.prepare("SELECT COUNT(*) n FROM notion_help_admin_writeback_outbox").get().n;
}
const queue=(h,before,after)=>h.api.queueHelpNotionAdminChange({
  database:h.db,agenda:"adoptions",entityId:7,
  before:{Meno:before},after:{Meno:after},fields:["Meno"],
});
const send=h=>h.api.retryOneHelpNotionWriteback({
  database:h.db,bindings:h.bindings,agenda:"adoptions",entityId:7,
});
test("successful Admin save has durable BEFORE/AFTER evidence before remote PATCH",async()=>{
  const h=await setup();
  h.state.value="Maxík";
  assert.equal(await queue(h,"Max","Maxík"),"pending");
  assert.equal(queuedCount(h.sqlite),1);
  const row=h.sqlite.prepare("SELECT fields_json,status FROM notion_help_admin_writeback_outbox").get();
  assert.equal(JSON.parse(row.fields_json).Meno.before,"Max");
  assert.equal(JSON.parse(row.fields_json).Meno.after,"Maxík");
  assert.equal(await send(h),"synced");
  assert.equal(h.state.writes.length,1);
  assert.deepEqual(Array.from(h.state.writes[0].changedHelpFields),["Meno"]);
  assert.equal(queuedCount(h.sqlite),0);
  assert.equal(await h.api.readHelpNotionWritebackStatus(h.db,h.bindings,"adoptions",7),"synced");
  h.sqlite.close();
});
test("transient Notion failure stays queued and retries without user re-save",async()=>{
  const h=await setup();
  h.state.value="Maxík";
  assert.equal(await queue(h,"Max","Maxík"),"pending");
  h.state.result="pending";
  assert.equal(await send(h),"pending");
  assert.equal(queuedCount(h.sqlite),1);
  h.state.result="synced";
  h.sqlite.exec("UPDATE notion_help_admin_writeback_outbox SET next_attempt_at=0");
  assert.equal(await send(h),"synced");
  assert.equal(queuedCount(h.sqlite),0);
  assert.equal(h.state.writes.length,2);
  h.sqlite.close();
});
test("different newer Notion edit stops old Admin retry and requires review",async()=>{
  const h=await setup();
  h.state.value="Maxík";h.state.remote="Maroš";
  await queue(h,"Max","Maxík");
  assert.equal(await send(h),"review");
  assert.equal(h.state.writes.length,0,"must never PATCH newer Notion field");
  assert.equal(h.sqlite.prepare("SELECT status,error_code FROM notion_help_admin_writeback_outbox").get().error_code,"NOTION_FIELD_CHANGED");
  assert.equal(await h.api.readHelpNotionWritebackStatus(h.db,h.bindings,"adoptions",7),"review");
  h.sqlite.close();
});
test("a newer Admin edit not in queue cannot be silently overwritten",async()=>{
  const h=await setup();
  h.state.value="Maxík";await queue(h,"Max","Maxík");
  h.state.value="Nový Max";
  assert.equal(await send(h),"review");
  assert.equal(h.state.writes.length,0);
  h.sqlite.close();
});
test("consecutive Admin changes preserve the first remote baseline and newest target",async()=>{
  const h=await setup();
  h.state.value="Maxík";await queue(h,"Max","Maxík");
  h.state.value="Maxičko";await queue(h,"Maxík","Maxičko");
  const field=JSON.parse(h.sqlite.prepare("SELECT fields_json FROM notion_help_admin_writeback_outbox").get().fields_json).Meno;
  assert.equal(field.before,"Max");
  assert.equal(field.after,"Maxičko");
  assert.equal(await send(h),"synced");
  assert.equal(h.state.remote,"Maxičko");
  h.sqlite.close();
});
test("Admin review and partner lock suppresses remote writes, preserves queued evidence",async()=>{
  const h=await setup();
  h.state.value="Maxík";await queue(h,"Max","Maxík");
  h.state.locked=true;
  assert.equal(await send(h),"disabled");
  assert.equal(queuedCount(h.sqlite),1);
  assert.equal(h.state.writes.length,0);
  h.sqlite.close();
});
test("only the four canonical Help agendas are accepted and D1 schema is additive",async()=>{
  const h=await setup();
  await assert.rejects(()=>h.api.queueHelpNotionAdminChange({
    database:h.db,agenda:"events",entityId:7,before:{},after:{},fields:["Meno"]
  }),/HELP_OUTBOX_BAD_IDENTITY/);
  const schema=await read("drizzle/0176_notion_help_admin_writeback_outbox.sql");
  assert.doesNotMatch(schema,/DROP TABLE|DELETE FROM|ALTER TABLE|INSERT INTO/i);
  const worker=await read("worker/index.ts");
  assert.match(worker,/runHelpNotionWritebackRetrySweep/);
  assert.match(worker,/controller\.cron === "\* \* \* \* \*"/);
  h.sqlite.close();
});
