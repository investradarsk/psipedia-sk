import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

// Use a controlled D1/Notion boundary: the production lifecycle module has
// Cloudflare-only imports that Node's .mjs test runner cannot resolve directly.
const raw=readFileSync(new URL("../lib/admin-record-lifecycle-retry.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(raw,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const exports={};
const allowedKinds=new Set(["directory","events","help","breeds","articles","adoptions","lost-found","organizations"]);
runInNewContext(compiled,{
  exports,Date,Math,Number,Promise,Error,console,
  require:name=>{
    if(name!=="./admin-record-lifecycle")throw Error("Unexpected dependency: "+name);
    return {isRecordKind:value=>allowedKinds.has(value),
      lifecycleSchemaReady:async()=>true,
      removeRecord:async()=>{throw Error("Unexpected real deletion in test");}};
  },
});
const {lifecycleRetryDue,runRecordLifecycleRetrySweep}=exports;

const latest=new Date("2026-11-11T16:00:00.000Z");
function fixture(errorCode=null) {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,status TEXT)");
  sqlite.exec("CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER,record_slug TEXT,record_name TEXT,record_category TEXT,created_by TEXT,updated_at TEXT,state TEXT,error_code TEXT,attempts INTEGER,notion_targets_json TEXT,record_external_key TEXT,PRIMARY KEY(kind,record_id))");
  sqlite.exec("CREATE TABLE admin_record_publication_guards(kind TEXT,record_id INTEGER)");
  const kinds=["directory","events","help","breeds","articles","adoptions","lost_found","organizations"];
  const starts=["admin_deleted_","admin_removing_","admin_guarded_"];
  const tails=["_insert","_update","_delete"];
  kinds.forEach(kind=>starts.forEach((prefix,index)=>sqlite.exec(
    "CREATE TRIGGER "+prefix+kind+tails[index]+" BEFORE INSERT ON directory_profiles BEGIN SELECT 1; END"
  )));
  sqlite.prepare("INSERT INTO admin_record_tombstones VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "directory",2,"miestny-kynologicky-klub-salkova","Miestny kynologický klub Banská Bystrica – Šalková",
    "kynologicke-kluby","owner@example.invalid","2026-11-10T10:00:00.000Z","READY_LOCAL",
    errorCode,0,"[]",null
  );
  return {
    sqlite,
    db:{ prepare(query){
      return {query,args:[],bind(...args){this.args=args;return this;},
        async first(){return sqlite.prepare(query).get(...this.args)??null;},
        async all(){return {results:sqlite.prepare(query).all(...this.args)};},
      };
    }},
  };
}

test("backoff starts after five minutes and is bounded without tight retries",()=>{
  const time=latest.getTime();
  assert.equal(lifecycleRetryDue(new Date(time-299_000).toISOString(),0,time),false);
  assert.equal(lifecycleRetryDue(new Date(time-300_000).toISOString(),0,time),true);
  assert.equal(lifecycleRetryDue(new Date(time-300_000).toISOString(),5,time),false);
  assert.equal(lifecycleRetryDue(new Date(time-86_400_001).toISOString(),30,time),true);
  assert.equal(lifecycleRetryDue("bad",0,time),false);
});

test("5-minute reconciler leases only existing owner-confirmed tombstones, not arbitrary IDs",async()=>{
  const f=fixture();
  const calls=[];
  try {
    const result=await runRecordLifecycleRetrySweep({
      database:f.db,bindings:{},now:latest,
      apply:async (_db,_bindings,kind,id,owner,localOnly,expected)=>{
        calls.push({kind,id,owner,localOnly,expected});
        return {state:"COMPLETE",id,notionTrash:"confirmed",media:{removed:0,preserved:0}};
      },
    });
    assert.equal(result.completed,1);
    assert.equal(result.claimed,1);
    assert.deepEqual(calls,[{kind:"directory",id:2,owner:"owner@example.invalid",
      localOnly:false,expected:{slug:"miestny-kynologicky-klub-salkova",
        name:"Miestny kynologický klub Banská Bystrica – Šalková",
        category:"kynologicke-kluby"}}]);
    const row=f.sqlite.prepare("SELECT attempts,updated_at FROM admin_record_tombstones WHERE record_id=2").get();
    assert.equal(row.attempts,1);
    assert.equal(row.updated_at,latest.toISOString());
    const repeat=await runRecordLifecycleRetrySweep({
      database:f.db,bindings:{},now:latest,apply:async()=>{throw Error("UNEXPECTED_DUPLICATE");},
    });
    assert.equal(repeat.claimed,0);
  }finally {f.sqlite.close();}
});

test("irreversible FK/review blockers are never automatically removed",async()=>{
  const f=fixture("D1_DELETE_BLOCKED_BY_REFERENCES");
  try {
    const result=await runRecordLifecycleRetrySweep({
      database:f.db,bindings:{},now:latest,apply:async()=>{throw Error("MUST_NOT_CALL");},
    });
    assert.equal(result.claimed,0);
    assert.equal(result.completed,0);
    assert.equal(f.sqlite.prepare("SELECT attempts FROM admin_record_tombstones WHERE record_id=2").get().attempts,0);
  }finally {f.sqlite.close();}
});

test("worker reuses existing 5-minute cron; no extra schedule or client retry required",()=>{
  const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../components/admin-record-lifecycle-actions.tsx",import.meta.url),"utf8");
  assert.match(worker,/runRecordLifecycleRetrySweep\(\{database:env.DB,bindings:env,limit:2\}\)/);
  assert.match(worker,/controller.cron === "\*\/5 \* \* \* \*"/);
  assert.match(ui,/confirmed:true/);
  assert.match(ui,/window.location.assign\(returnHref\)/);
  assert.doesNotMatch(ui,/VYMAZAŤ|Druhé potvrdenie/);
});
