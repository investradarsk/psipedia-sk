import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  APPROVED_0130_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0130Target, assert0130NotAlreadyApplied,
  assertFacebookImagePostsSchema, assertFacebookImagePublisherSchema,
  assertPendingTargetSchemaClean, targetSchemaObjects, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0130_facebook_image_publisher.sql";
const predecessor = "0129_gemini_external_manual_queue.sql";
const sql = readFileSync(new URL("../drizzle/0130_facebook_image_publisher.sql",import.meta.url),"utf8");
const sql128 = readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml",import.meta.url),"utf8");
function objects(db) {
  return {objects:db.prepare("SELECT name,type,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')").all()};
}
function fixture(){
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(sql128);
  const key="facebook-images/2030/00000000-0000-4000-8000-000000000001.jpg";
  const id="00000000-0000-4000-8000-000000000001";
  db.prepare(`INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,created_at,updated_at,created_by,updated_by)
    VALUES(?,?,?,?,?,?,?,? ,?,?,?)`).run(id,"Test",`/media/${key}`,key,"Existing caption","2030-10-16T10:00:00.000Z","scheduled",
    "2030-10-15T10:00:00.000Z","2030-10-15T10:00:00.000Z","test","test");
  return {db,id};
}

test("0130 is an explicit pinned canonical production migration after 0129, not an unapproved prepared target",()=>{
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1),target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2),predecessor);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS,[]);
  assert.equal(createHash("sha256").update(sql).digest("hex"),APPROVED_0130_SHA256);
  assert.doesNotThrow(()=>assertApproved0130Target("psipedia-sk-db",APPROVED_0130_SHA256));
  assert.throws(()=>assertApproved0130Target("other-db",APPROVED_0130_SHA256),/canonical psipedia-sk-db/);
  assert.throws(()=>assertApproved0130Target("psipedia-sk-db","wrong-sha"),/SHA256 differs/);
  assert.throws(()=>assert0130NotAlreadyApplied(target,true),/already applied/);
  assert.doesNotThrow(()=>assert0130NotAlreadyApplied(target,false));
});

test("0130 workflow only runs by manual production confirmation on main",()=>{
  assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/0130_facebook_image_publisher\.sql\) expected_confirmation="APPLY-0130-psipedia-sk-db"/);
  assert.match(workflow,/- 0130_facebook_image_publisher\.sql/);
  assert.doesNotMatch(workflow,/^\s*(?:schedule|push|pull_request):/m);
});

test("0130 requires complete ledger exactly through 0129 and refuses gaps or reruns",()=>{
  const expected=[...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),...SUPPORTED_PRODUCTION_TARGETS];
  const prior=expected.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(prior,expected,target),{latestIndex:129,targetApplied:false});
  assert.throws(()=>validateProductionTargetHistory(prior.slice(0,-1),expected,target),/expected exactly 0129/);
  assert.throws(()=>validateProductionTargetHistory([...prior.slice(0,-1),"0129_rogue.sql"],expected,target),/does not exactly match/);
  assert.deepEqual(validateProductionTargetHistory(expected,expected,target),{latestIndex:130,targetApplied:true});
  assert.throws(()=>assert0130NotAlreadyApplied(target,true),/already applied/);
});

test("0130 is additive, retains 0128 records and defaults global publisher to OFF",()=>{
  const {db,id}=fixture();
  try{
    const before=db.prepare("SELECT * FROM facebook_image_posts WHERE id=?").get(id);
    assertFacebookImagePostsSchema(objects(db));
    assert.deepEqual(targetSchemaObjects(objects(db),target),{partial:false});
    assert.doesNotThrow(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(objects(db),target)));
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(objects(db),target),{partial:true});
    assertFacebookImagePublisherSchema(objects(db));
    assert.deepEqual(db.prepare("SELECT * FROM facebook_image_posts WHERE id=?").get(id),before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM facebook_image_publisher_settings").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM facebook_image_publish_attempts").get().n,0);
    db.prepare("INSERT INTO facebook_image_publisher_settings(id,updated_at,updated_by) VALUES(1,'now','admin')").run();
    assert.equal(db.prepare("SELECT enabled FROM facebook_image_publisher_settings WHERE id=1").get().enabled,0);
    assert.throws(()=>db.prepare("INSERT INTO facebook_image_publisher_settings(id,updated_at,updated_by) VALUES(2,'now','admin')").run(),/CHECK constraint failed/);
    assert.throws(()=>db.prepare("UPDATE facebook_image_publisher_settings SET enabled=2 WHERE id=1").run(),/CHECK constraint failed/);
  }finally{db.close();}
});

test("0130 ensures atomic one-claim per existing post and strict FK and outcome constraints",()=>{
  const {db,id}=fixture();
  try{
    db.exec(sql);
    const stmt=db.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,started_at) VALUES(?,?,?)");
    assert.throws(()=>stmt.run("00000000-0000-4000-8000-000000000999",1,"now"),/FOREIGN KEY constraint failed/);
    assert.throws(()=>stmt.run(id,0,"now"),/CHECK constraint failed/);
    stmt.run(id,1,"now");
    assert.throws(()=>stmt.run(id,1,"now"),/UNIQUE constraint failed/);
    assert.throws(()=>db.prepare("DELETE FROM facebook_image_posts WHERE id=?").run(id),/FOREIGN KEY constraint failed/);
    assert.throws(()=>db.prepare("UPDATE facebook_image_publish_attempts SET state='PUBLISHED' WHERE post_id=?").run(id),/CHECK constraint failed/);
    db.prepare("UPDATE facebook_image_publish_attempts SET state='PUBLISHED',remote_id='12345',completed_at='now' WHERE post_id=?").run(id);
    assertFacebookImagePublisherSchema(objects(db));
  }finally{db.close();}
});

test("0130 guards detect partial/malformed settings, missing index and unexpected credential fields",()=>{
  const {db}=fixture();
  try{
    db.exec("CREATE TABLE facebook_image_publisher_settings(id INTEGER PRIMARY KEY)");
    assert.deepEqual(targetSchemaObjects(objects(db),target),{partial:true});
    assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(objects(db),target)),/not recorded/);
    assert.throws(()=>assertFacebookImagePublisherSchema(objects(db)),/Missing 0130/);
  }finally{db.close();}
});
