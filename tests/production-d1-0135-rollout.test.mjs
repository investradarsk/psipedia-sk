import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {PINNED_SHA256_0135,OBJECTS_0135,expected0135Objects} from "../scripts/production-d1-0135-schema.mjs";
import {APPROVED_0135_SHA256,PREPARED_PRODUCTION_TARGETS,SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0135Target,assert0135NotAlreadyApplied,assertFacebookRetry0135Schema,
  targetSchemaObjects,assertPendingTargetSchemaClean,validateProductionTargetHistory,
  assertFacebookRetryPreserved} from "../scripts/production-d1-migrate.mjs";
const target="0135_facebook_image_safe_retry.sql";
const sql=readFileSync(new URL("../drizzle/"+target,import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/production-d1-migrate.yml",import.meta.url),"utf8");
const runner=readFileSync(new URL("../scripts/production-d1-migrate.mjs",import.meta.url),"utf8");
function fixture() {
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON;");
 for(const name of ["0128_facebook_image_posts.sql","0130_facebook_image_publisher.sql",
   "0131_facebook_image_trash.sql","0132_facebook_image_direct_consent.sql"])
   db.exec(readFileSync(new URL("../drizzle/"+name,import.meta.url),"utf8"));
 const schema=()=>({objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),
   facebookImageAttemptColumns:db.prepare("PRAGMA table_info('facebook_image_publish_attempts')").all()});
 return {db,schema};
}
test("0135 target requires immutable SHA, exact production identity, approved 0134 predecessor and manual one-shot confirmation",()=>{
 assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-7),target);
 assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
 assert.equal(createHash("sha256").update(sql).digest("hex"),PINNED_SHA256_0135);
 assert.equal(APPROVED_0135_SHA256,PINNED_SHA256_0135);
 assert.doesNotThrow(()=>assertApproved0135Target("psipedia-sk-db",APPROVED_0135_SHA256));
 assert.throws(()=>assertApproved0135Target("wrong-db",APPROVED_0135_SHA256),/canonical/);
 assert.throws(()=>assertApproved0135Target("psipedia-sk-db","different"),/SHA256/);
 assert.throws(()=>assert0135NotAlreadyApplied(target,true),/already applied/);
 assert.match(workflow,/- 0135_facebook_image_safe_retry\.sql/);
 assert.match(workflow,/0135_facebook_image_safe_retry\.sql\) expected_confirmation="APPLY-0135-psipedia-sk-db"/);
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/group: production-d1-migration/);
 assert.doesNotMatch(workflow,/^\s*(?:push|pull_request|schedule):/m);
 assert.match(runner,/assert0135NotAlreadyApplied\(targetMigration, state\.targetApplied\)/);
 assert.match(runner,/assert0135NotAlreadyApplied\(targetMigration, internal\.targetApplied \|\| liveState\.targetApplied\)/);
 const chain=[...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),
   ...SUPPORTED_PRODUCTION_TARGETS.filter(name=>Number(name.slice(0,4))<=135)];
 assert.deepEqual(validateProductionTargetHistory(chain.slice(0,-1),chain,target),
   {latestIndex:134,targetApplied:false});
 assert.throws(()=>validateProductionTargetHistory(chain.slice(0,-2),chain,target),/expected exactly 0134/);
 assert.throws(()=>validateProductionTargetHistory([...chain.slice(0,-2),"0134_fake.sql"],chain,target),/exactly match/);
});
test("0135 SQLite is additive, preflight catches partial columns and canonical object mismatch",()=>{
 const f=fixture();
 try {
   assert.equal(expected0135Objects(sql).size,OBJECTS_0135.length);
   assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:false});
   f.db.exec("ALTER TABLE facebook_image_publish_attempts ADD COLUMN retry_count INTEGER");
   assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
   assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(f.schema(),target)),/partial\/manual drift/);
 } finally{f.db.close();}
});
test("0135 creates immutable history and leaves original Facebook attempt records unchanged",()=>{
 const f=fixture();
 try{
 const id="00000000-0000-4000-8000-000000001350";
 f.db.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,approval_status,version,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
 id,"Facebook","/media/facebook-images/2030/"+id+".jpg","facebook-images/2030/"+id+".jpg","Caption",
 "2030-01-02T09:00:00.000Z","scheduled","APPROVED",1,"2030-01-01","2030-01-01","editor","editor");
 f.db.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,state,started_at,completed_at,error_code) VALUES(?,1,'UNCERTAIN',?,?,?)").run(id,"2030-01-01","2030-01-01","META_HTTP_429");
 const prior=f.db.prepare("SELECT post_id,snapshot_version,state,remote_id,started_at,completed_at,error_code FROM facebook_image_publish_attempts WHERE post_id=?").get(id);
 assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:false});
 assert.throws(()=>assertFacebookRetry0135Schema(f.schema()),/0135/);
 f.db.exec(sql);
 assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
 assert.equal(assertFacebookRetry0135Schema(f.schema()),true);
 assert.deepEqual(f.db.prepare("SELECT post_id,snapshot_version,state,remote_id,started_at,completed_at,error_code FROM facebook_image_publish_attempts WHERE post_id=?").get(id),prior);
 assert.deepEqual({...f.db.prepare("SELECT retry_count,retry_not_before,outcome_kind FROM facebook_image_publish_attempts WHERE post_id=?").get(id)},
   {retry_count:0,retry_not_before:null,outcome_kind:"UNKNOWN"});
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM facebook_image_publish_attempt_history").get().n,0);
 f.db.prepare("UPDATE facebook_image_publish_attempts SET outcome_kind='PROVEN_REJECTED',retry_not_before=? WHERE post_id=?")
   .run("2030-01-01T01:00:00.000Z",id);
 f.db.prepare("UPDATE facebook_image_posts SET version=2,updated_at=? WHERE id=?").run("2030-01-01T00:05:00.000Z",id);
 assert.equal(f.db.prepare("SELECT outcome_kind FROM facebook_image_publish_attempts WHERE post_id=?").get(id).outcome_kind,"SUPERSEDED");
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM facebook_image_publish_attempt_history").get().n,1);
 assert.throws(()=>f.db.exec("DELETE FROM facebook_image_publish_attempt_history"),/append-only/);
 for(const name of OBJECTS_0135){
  const mutated={...f.schema(),objects:f.schema().objects.filter(x=>x.name!==name)};
  assert.throws(()=>assertFacebookRetry0135Schema(mutated),/0135/);
 }
 } finally {f.db.close();}
});
test("0135 preservation check rejects any changed Facebook schedule, attempt or STOP",()=>{
 const before={posts:2,attempts:1,settings:1,postsSha:"a",attemptsSha:"b",settingsSha:"c"};
 assert.doesNotThrow(()=>assertFacebookRetryPreserved(before,{...before}));
 for(const field of Object.keys(before)){
   const changed={...before,[field]:typeof before[field]==="number"?before[field]+1:before[field]+"x"};
   assert.throws(()=>assertFacebookRetryPreserved(before,changed),/0135 changed/);
 }
});
