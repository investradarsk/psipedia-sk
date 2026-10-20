import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  TARGET_0134,PINNED_SHA256_0134,TABLES_0134,INDEXES_0134,TRIGGERS_0134,AUTO_INDEX_0134,
  SQL_LEDGER_0134,SQL_OBJECTS_0134,QUERIES_0134,
  assertReadonly0134Query,buildReadonly0134Command,
  expected0134Objects,classify0134,audit0134
} from "../scripts/production-d1-0134-readonly.mjs";
import {SQL_METRICS_0133} from "../scripts/production-d1-0133-readonly.mjs";

const m133=readFileSync(new URL("../drizzle/0133_services_canonical_admin_foundation.sql",import.meta.url),"utf8");
const m134=readFileSync(new URL("../drizzle/0134_services_admin_change_audit.sql",import.meta.url),"utf8");
const script=readFileSync(new URL("../scripts/production-d1-0134-readonly.mjs",import.meta.url),"utf8");
const dispatch=readFileSync(new URL("../.github/workflows/production-d1-0134-readonly.yml",import.meta.url),"utf8");
const ci=readFileSync(new URL("../.github/workflows/production-d1-0134-offline-ci.yml",import.meta.url),"utf8");
const canonical=[...Array.from({length:133},(_,i)=>String(i).padStart(4,"0")+"_fixture.sql"),
 "0133_services_canonical_admin_foundation.sql",TARGET_0134];
const resources={account_id:"5ff902d3d80376478b9213b2b8ae8d6e",
 d1:{binding:"DB",database_name:"psipedia-sk-db",database_id:"8f7a0c3e-4d77-4a35-8192-a7bd57147950"}};
const env={GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"c58aec64995d95eea0edce0805dd415775874da0",
 GITHUB_WORKFLOW:"Production D1 0134 Read-only Verifier",
 CLOUDFLARE_API_TOKEN:"fake-in-memory-test-only",CLOUDFLARE_ACCOUNT_ID:resources.account_id};

function fixture({schema134=false,ledger134=false,newer=false}={}) {
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY)");
 db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)");
 const put=db.prepare("INSERT INTO d1_migrations(id,name) VALUES (?,?)");
 canonical.slice(0,134).forEach((n,i)=>put.run(i+1,n));
 db.exec(m133);
 if(schema134)db.exec(m134); // Offline synthetic fixture only, never real D1.
 if(ledger134)put.run(135,TARGET_0134);
 if(newer){put.run(136,"0135_future.sql");}
 const query=async(_db,sql)=>db.prepare(assertReadonly0134Query(sql)).all();
 const data=()=>({
  ledger:db.prepare(SQL_LEDGER_0134).all(),objects:db.prepare(SQL_OBJECTS_0134).all(),
  metrics:db.prepare(SQL_METRICS_0133).all(),canonicalNames:newer?[...canonical,"0135_future.sql"]:canonical,
  migration0133:m133,migration0134:m134,mainSha:env.GITHUB_SHA
 });
 return {db,query,data};
}
function classify(f,changes={}) {return classify0134({...f.data(),...changes});}
function safeRun(f,options={}) {
 return audit0134({resources,migration0133:m133,migration0134:m134,canonicalNames:canonical,
  env,query:f.query,...options});
}

test("0134 bytes and canonical 2-table, 1-index, 10-trigger inventory are pinned",()=>{
 assert.equal(createHash("sha256").update(m134).digest("hex"),PINNED_SHA256_0134);
 const want=[...TABLES_0134,...INDEXES_0134,...TRIGGERS_0134];
 const map=expected0134Objects(m134);
 assert.equal(map.size,13);assert.deepEqual([...map.keys()].sort(),want.sort());
 assert.equal(TRIGGERS_0134.length,10);
});
test("trigger parser keeps internal INSERT/SELECT semicolons in the full canonical statement",()=>{
 const statements=expected0134Objects(m134);
 assert.match(statements.get("service_catalog_admin_choice_audit_delete").sql,/system:db_delete/);
 assert.match(statements.get("service_catalog_admin_option_approval_receipt").sql,/not exists/);
 assert.match(statements.get("service_catalog_admin_audit_no_delete").sql,/raise\(abort/);
});
test("only exact three immutable SELECT statements can reach the Wrangler command",()=>{
 assert.deepEqual(QUERIES_0134,[SQL_LEDGER_0134,SQL_OBJECTS_0134,SQL_METRICS_0133]);
 for(const q of QUERIES_0134){
  assert.equal(assertReadonly0134Query(q),q);
  assert.match(q,/^SELECT /);assert.doesNotMatch(q,/;|\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|PRAGMA)\b/i);
  assert.deepEqual(buildReadonly0134Command(resources.d1.database_name,q),
   ["wrangler","d1","execute",resources.d1.database_name,"--remote","--json","--command",q]);
 }
});
test("arbitrary SQL, PRAGMA, DML, DDL, stacked statements and wrong database reject",()=>{
 for(const sql of ["SELECT 1","SELECT * FROM sqlite_master","PRAGMA table_info(x)","PRAGMA foreign_key_check",
  "INSERT INTO t VALUES (1)","UPDATE t SET a=1","DELETE FROM t","CREATE TABLE t(id INT)",
  "DROP TABLE t","ATTACH DATABASE 'f' AS z",SQL_LEDGER_0134+"; DROP TABLE x",null,{}])
  assert.throws(()=>assertReadonly0134Query(sql),/UNAUTHORIZED_SQL/);
 assert.throws(()=>buildReadonly0134Command("different-db",SQL_LEDGER_0134),/WRONG_DATABASE/);
});
test("not applied: exact 0133 plus absent 0134 objects yields NOT_APPLIED_VERIFIED",()=>{
 const f=fixture();try{const result=classify(f);assert.equal(result.result,"NOT_APPLIED_VERIFIED");
  assert.equal(result.history0134,"NOT_RECORDED");assert.equal(result.priorState,"PASS");
  assert.equal(result.confirmedObjects,0);assert.equal(result.expectedObjects,14);}finally{f.db.close();}
});
test("applied: complete 0134 matches exact source including implicit UNIQUE index",()=>{
 const f=fixture({schema134:true,ledger134:true});try{const result=classify(f);
  assert.equal(result.result,"APPLIED_AND_VERIFIED");assert.equal(result.confirmedObjects,14);
  assert.deepEqual(result.missingObjects,[]);assert.deepEqual(result.changedObjects,[]);
  assert.ok(f.data().objects.some(x=>x.name===AUTO_INDEX_0134&&x.sql===null));}finally{f.db.close();}
});
test("0134 history with no 0134 schema is inconsistent",()=>{
 const f=fixture({ledger134:true});try{assert.equal(classify(f).result,"PARTIAL_OR_INCONSISTENT");}finally{f.db.close();}
});
test("0134 objects without migration ledger are inconsistent",()=>{
 const f=fixture({schema134:true});try{assert.equal(classify(f).result,"PARTIAL_OR_INCONSISTENT");}finally{f.db.close();}
});
test("missing single trigger detects partial schema",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();p.objects=p.objects.filter(x=>x.name!==TRIGGERS_0134[0]);
  assert.equal(classify0134(p).result,"PARTIAL_OR_INCONSISTENT");
 }finally{f.db.close();}
});
test("extra unapproved trigger on an existing Services table cannot masquerade as not-applied",()=>{
 const f=fixture();try{
  const p=f.data();p.objects.push({type:"trigger",name:"rogue_private_trigger",
   tbl_name:"service_catalog_admin_options",sql:"CREATE TRIGGER rogue_private_trigger AFTER UPDATE ON service_catalog_admin_options BEGIN SELECT 1; END"});
  const report=classify0134(p);
  assert.equal(report.result,"SCHEMA_DRIFT_BLOCKED");
  assert.ok(report.unexpectedObjects.includes("UNEXPECTED_SERVICES_OBJECT"));
  assert.doesNotMatch(JSON.stringify(report),/rogue_private_trigger/);
 }finally{f.db.close();}
});

test("altered audit trigger body is SCHEMA_DRIFT_BLOCKED",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();p.objects=p.objects.map(x=>x.name===TRIGGERS_0134[5]?
    {...x,sql:x.sql.replace("RAISE(ABORT","RAISE(IGNORE")}:x);
  assert.equal(classify0134(p).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("missing or rewritten explicit index is blocked",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();assert.equal(classify0134({...p,objects:p.objects.filter(x=>x.name!==INDEXES_0134[0])}).result,"PARTIAL_OR_INCONSISTENT");
  const altered=p.objects.map(x=>x.name===INDEXES_0134[0]?{...x,sql:x.sql.replace("profile_id","actor")}:x);
  assert.equal(classify0134({...p,objects:altered}).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("changed CHECK, UNIQUE, FK and implicit UNIQUE index are blocked",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();
  for(const [name,from,to] of [
    [TABLES_0134[0],"('INSERT','UPDATE','RESET','DELETE')","('INSERT','UPDATE')"],
    [TABLES_0134[1],"UNIQUE(option_id,option_version)","UNIQUE(option_id)"],
    [TABLES_0134[1],"ON DELETE RESTRICT","ON DELETE CASCADE"]]){
    const q=p.objects.map(x=>x.name===name?{...x,sql:x.sql.replace(from,to)}:x);
    assert.equal(classify0134({...p,objects:q}).result,"SCHEMA_DRIFT_BLOCKED");
   }
   const q=p.objects.map(x=>x.name===AUTO_INDEX_0134?{...x,type:"table"}:x);
   assert.equal(classify0134({...p,objects:q}).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("weakened append-only policy is blocked",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();const q=p.objects.map(x=>x.name==="service_catalog_admin_receipt_no_delete"?
   {...x,sql:x.sql.replace("RAISE(ABORT","RAISE(IGNORE")}:x);
  assert.equal(classify0134({...p,objects:q}).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("weakened receipt-gated ACTIVE promotion is blocked",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();const q=p.objects.map(x=>x.name==="service_catalog_admin_option_approval_receipt"?
   {...x,sql:x.sql.replace("NOT EXISTS","EXISTS")}:x);
  assert.equal(classify0134({...p,objects:q}).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("0133 missing from history blocks, without assuming last migration is 0134",()=>{
 const f=fixture({schema134:true,ledger134:true,newer:true});try{
  assert.equal(classify(f).result,"APPLIED_AND_VERIFIED");
  const p=f.data();p.ledger=p.ledger.filter(x=>x.name!=="0133_services_canonical_admin_foundation.sql");
  assert.equal(classify0134(p).result,"PARTIAL_OR_INCONSISTENT");
 }finally{f.db.close();}
});
test("duplicate, reordered, unknown or incomplete ledgers are blocked",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();const alts=[
   [...p.ledger,p.ledger.at(-1)],
   [...p.ledger.slice(0,-2),p.ledger.at(-1),p.ledger.at(-2)],
   p.ledger.map((x,i)=>i===10?{...x,name:"0010_wrong.sql"}:x),
   p.ledger.slice(0,-1)
  ];
  assert.equal(classify0134({...p,ledger:alts[0]}).result,"PARTIAL_OR_INCONSISTENT");
  assert.equal(classify0134({...p,ledger:alts[1]}).result,"PARTIAL_OR_INCONSISTENT");
  assert.equal(classify0134({...p,ledger:alts[2]}).result,"PARTIAL_OR_INCONSISTENT");
  assert.equal(classify0134({...p,ledger:alts[3]}).result,"PARTIAL_OR_INCONSISTENT");
 }finally{f.db.close();}
});
test("0133 schema drift or orphaned historical data is never accepted",()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const p=f.data();
  assert.equal(classify0134({...p,objects:p.objects.filter(x=>x.name!=="service_catalog_admin_options")}).result,"SCHEMA_DRIFT_BLOCKED");
  assert.equal(classify0134({...p,metrics:[{...p.metrics[0],choice_orphans:1}]}).result,"SCHEMA_DRIFT_BLOCKED");
 }finally{f.db.close();}
});
test("unknown or contradictory remote results are UNKNOWN, never PASS",()=>{
 const f=fixture();try{
  const p=f.data();assert.equal(classify0134({...p,metrics:[]}).result,"UNKNOWN");
  assert.equal(classify0134({...p,objects:[{name:"x",type:null}]}).result,"UNKNOWN");
  assert.equal(classify0134({...p,ledger:"bad"}).result,"PARTIAL_OR_INCONSISTENT");
 }finally{f.db.close();}
});
test("invalid identity, workflow, confirmation context or SQL SHA prevent ANY remote query",async()=>{
 let reads=0;const query=async()=>{reads++;return [];};
 const base={resources,env,query,migration0133:m133,migration0134:m134,canonicalNames:canonical};
 const bad=[
  {resources:{...resources,account_id:"bad"}},
  {resources:{...resources,d1:{...resources.d1,database_id:"bad"}}},
  {resources:{...resources,d1:{...resources.d1,binding:"OTHER"}}},
  {env:{...env,CLOUDFLARE_ACCOUNT_ID:"wrong"}},
  {env:{...env,CLOUDFLARE_API_TOKEN:""}},
  {env:{...env,GITHUB_ACTIONS:"false"}},
  {env:{...env,GITHUB_EVENT_NAME:"pull_request"}},
  {env:{...env,GITHUB_REF:"refs/heads/pr-branch"}},
  {env:{...env,GITHUB_SHA:"changed"}},
  {env:{...env,GITHUB_WORKFLOW:"Other Workflow"}},
  {migration0134:m134+"\n--modified"},
  {migration0133:m133+"\n--modified"},
  {canonicalNames:canonical.slice(0,-1)}
 ];
 for(const changes of bad)await assert.rejects(()=>audit0134({...base,...changes}),/GUARD|CHANGED|INVENTORY/);
 assert.equal(reads,0);
});
test("invalid remote JSON/transport response fails UNKNOWN safely",async()=>{
 const f=fixture();try{
  let calls=0;const result=await safeRun(f,{query:async()=>{calls++;throw Error("sensitive payload");}});
  assert.equal(result.result,"UNKNOWN");assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(result),/sensitive payload|fake-in-memory-test-only/);
  const invalid=await safeRun(f,{query:async()=>({success:true,results:[]})});
  assert.equal(invalid.result,"UNKNOWN");
 }finally{f.db.close();}
});
test("fully verified in-memory audit uses only allowed read queries",async()=>{
 const f=fixture({schema134:true,ledger134:true});try{
  const observed=[];const result=await safeRun(f,{query:async(db,sql)=>{
   observed.push(sql);return f.query(db,sql);
  }});
  assert.equal(result.result,"APPLIED_AND_VERIFIED");
  assert.deepEqual(observed,QUERIES_0134);
  assert.equal(result.featureFlags.SERVICE_CATALOG_NOTION_MIRROR_READY,"UNKNOWN");
 }finally{f.db.close();}
});
test("not applied accepted from in-memory remote adapter without fabricated feature flags",async()=>{
 const f=fixture();try{
  const report=await safeRun(f);
  assert.equal(report.result,"NOT_APPLIED_VERIFIED");
  assert.equal(report.featureFlags.SERVICE_CATALOG_ADMIN_WRITES_ENABLED,"UNKNOWN");
 }finally{f.db.close();}
});
test("workflow dispatch only, protected current-main guard, shared lock, no apply or deploy",()=>{
 assert.match(dispatch,/name: Production D1 0134 Read-only Verifier/);
 assert.match(dispatch,/workflow_dispatch:/);
 assert.match(dispatch,/AUDIT-0134-state-psipedia-sk-db/);
 assert.match(dispatch,/refs\/heads\/main/);
 assert.match(dispatch,/origin\/main/);
 assert.match(dispatch,/environment: production/);
 assert.match(dispatch,/group: production-d1-migration/);
 assert.match(dispatch,/permissions:\s*\n\s*contents: read/);
 assert.match(dispatch,/CLOUDFLARE_D1_API_TOKEN/);
 assert.doesNotMatch(dispatch,/^\s*(push|pull_request|schedule|workflow_run):/m);
 assert.doesNotMatch(dispatch,/\bmigrations\s+apply\b|\bdeploy:cloudflare\b|\btime-travel\s+restore\b/i);
 assert.doesNotMatch(script,/production-d1-migrate\.mjs|migrations\s*,\s*apply/);
});
test("offline CI has scoped PR trigger, tests and no production token, remote or writes",()=>{
 assert.match(ci,/pull_request:/);assert.match(ci,/node --check/);
 assert.match(ci,/production-d1-0134-readonly\.test\.mjs/);
 assert.match(ci,/db:check-migrations/);
 assert.doesNotMatch(ci,/workflow_dispatch:|CLOUDFLARE_D1_API_TOKEN|--remote|migrations\s+apply|deploy:/i);
});
