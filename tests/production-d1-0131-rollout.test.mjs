import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  APPROVED_0131_SHA256,PREPARED_PRODUCTION_TARGETS,SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0131Target,assert0131NotAlreadyApplied,
  assertFacebookImagePostsSchema,assertFacebookImagePublisherSchema,assertFacebookImageTrashSchema,
  targetSchemaObjects,assertPendingTargetSchemaClean,validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target="0131_facebook_image_trash.sql";
const previous="0130_facebook_image_publisher.sql";
const migration=readFileSync(new URL("../drizzle/"+target,import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/production-d1-migrate.yml",import.meta.url),"utf8");
const sql128=readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
const sql130=readFileSync(new URL("../drizzle/0130_facebook_image_publisher.sql",import.meta.url),"utf8");

function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(sql128);db.exec(sql130);
  const id="00000000-0000-4000-8000-000000000001";
  const key="facebook-images/2030/"+id+".jpg";
  db.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,notion_page_id,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,"Existujúci príspevok","/media/"+key,key,"Pôvodný text",
      "2030-01-02T11:00:00.000Z","scheduled",
      "3e0793fc-1d18-8138-8bb7-f0e0a7495728","2030-01-01T09:00:00.000Z",
      "2030-01-01T09:00:00.000Z","admin","admin");
  db.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,state,started_at,completed_at,error_code) VALUES(?,1,'UNCERTAIN','2030-01-01T09:00:00.000Z','2030-01-01T09:01:00.000Z','META_HTTP_401')").run(id);
  function schema(){
    return {
      objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),
      facebookImagePostColumns:db.prepare("PRAGMA table_info('facebook_image_posts')").all(),
    };
  }
  return {db,id,schema};
}

test("0131 rollout requires exact SQL hash, canonical database and protected manual workflow",()=>{
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1),target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2),previous);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS,[]);
  assert.equal(createHash("sha256").update(migration).digest("hex"),APPROVED_0131_SHA256);
  assert.doesNotThrow(()=>assertApproved0131Target("psipedia-sk-db",APPROVED_0131_SHA256));
  assert.throws(()=>assertApproved0131Target("other-db",APPROVED_0131_SHA256),/canonical/);
  assert.throws(()=>assertApproved0131Target("psipedia-sk-db","wrong-hash"),/SHA256/);
  assert.match(workflow,/^\s*workflow_dispatch:/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/- 0131_facebook_image_trash\.sql/);
  assert.match(workflow,/0131_facebook_image_trash\.sql\) expected_confirmation="APPLY-0131-psipedia-sk-db"/);
  assert.doesNotMatch(workflow,/^\s*(?:push|schedule|pull_request):/m);
});

test("0131 refuses missing 0130 predecessor, stale ledger and repeated migration",()=>{
  const chain=[...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),...SUPPORTED_PRODUCTION_TARGETS];
  const before=chain.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(before,chain,target),{latestIndex:130,targetApplied:false});
  assert.deepEqual(validateProductionTargetHistory(chain,chain,target),{latestIndex:131,targetApplied:true});
  assert.throws(()=>validateProductionTargetHistory(before.slice(0,-1),chain,target),/expected exactly 0130/);
  assert.throws(()=>validateProductionTargetHistory([...before.slice(0,-1),"0130_rogue.sql"],chain,target),/does not exactly match/);
  assert.throws(()=>assert0131NotAlreadyApplied(target,true),/already applied/);
  assert.doesNotThrow(()=>assert0131NotAlreadyApplied(target,false));
});

test("0131 ALTER is additive, preserves every old post field, notion identity and Meta attempt ledger",()=>{
  const f=fixture();
  try {
    const oldCols=f.db.prepare("SELECT id,title,image_url,image_key,caption,scheduled_at,status,notion_page_id,version,created_at,updated_at,created_by,updated_by FROM facebook_image_posts").all();
    const oldAttempt=f.db.prepare("SELECT * FROM facebook_image_publish_attempts").all();
    assertFacebookImagePostsSchema(f.schema());
    assertFacebookImagePublisherSchema(f.schema());
    assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:false});
    assert.doesNotThrow(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(f.schema(),target)));
    assert.throws(()=>assertFacebookImageTrashSchema(f.schema()),/0131/);
    f.db.exec(migration);
    assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
    assert.doesNotThrow(()=>assertFacebookImageTrashSchema(f.schema()));
    assertFacebookImagePostsSchema(f.schema());
    assertFacebookImagePublisherSchema(f.schema());
    assert.deepEqual(f.db.prepare("SELECT id,title,image_url,image_key,caption,scheduled_at,status,notion_page_id,version,created_at,updated_at,created_by,updated_by FROM facebook_image_posts").all(),oldCols);
    assert.deepEqual(f.db.prepare("SELECT * FROM facebook_image_publish_attempts").all(),oldAttempt);
    assert.deepEqual(f.db.prepare("SELECT deleted_at,deleted_by FROM facebook_image_posts").all(),[{deleted_at:null,deleted_by:null}]);
    assert.throws(()=>f.db.exec(migration),/duplicate column name/);
  }finally{f.db.close();}
});

test("0131 fails closed for half-applied columns, missing index and wrong index/column definitions",()=>{
  {
    const f=fixture();try {
      f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN deleted_at TEXT;");
      assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
      assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(f.schema(),target)),/partial\/manual drift/);
      assert.throws(()=>assertFacebookImageTrashSchema(f.schema()),/0131/);
    }finally{f.db.close();}
  }
  {
    const f=fixture();try {
      f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN deleted_at TEXT;");
      f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN deleted_by TEXT;");
      assert.throws(()=>assertFacebookImageTrashSchema(f.schema()),/index/);
      f.db.exec("CREATE INDEX facebook_image_posts_trash_idx ON facebook_image_posts(deleted_by,updated_at,id)");
      assert.throws(()=>assertFacebookImageTrashSchema(f.schema()),/index/);
    }finally{f.db.close();}
  }
  {
    const f=fixture();try {
      f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN deleted_at INTEGER DEFAULT 0;");
      f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN deleted_by TEXT;");
      f.db.exec("CREATE INDEX facebook_image_posts_trash_idx ON facebook_image_posts(deleted_at,updated_at DESC,id)");
      assert.throws(()=>assertFacebookImageTrashSchema(f.schema()),/nullable TEXT/);
    }finally{f.db.close();}
  }
});
