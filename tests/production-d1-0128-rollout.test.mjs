import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_0128_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0128Target, assert0128NotAlreadyApplied,
  assertFacebookImagePostsSchema, assertPendingTargetSchemaClean,
  selectMigrationsThrough, targetSchemaObjects, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const target="0128_facebook_image_posts.sql";
const previous="0127_gemini_notion_created_pages.sql";
const source=readFileSync(path.join(root,"drizzle",target));
const workflow=readFileSync(path.join(root,".github/workflows/production-d1-migrate.yml"),"utf8");

test("0128 exact immutable SQL, canonical D1 target and one-at-a-time approval",()=>{
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(target));
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2),"0130_facebook_image_publisher.sql");
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS,[]);
  assert.equal(createHash("sha256").update(source).digest("hex"),APPROVED_0128_SHA256);
  assert.doesNotThrow(()=>assertApproved0128Target("psipedia-sk-db",APPROVED_0128_SHA256));
  assert.throws(()=>assertApproved0128Target("wrong-db",APPROVED_0128_SHA256),/canonical psipedia-sk-db/);
  assert.throws(()=>assertApproved0128Target("psipedia-sk-db","wrong-hash"),/SQL SHA256 differs/);
  assert.equal(JSON.parse(readFileSync(path.join(root,"config/cloudflare-resources.json"),"utf8")).d1.database_name,"psipedia-sk-db");
});

test("0128 workflow is manual on main with exact explicit confirmation; existing targets stay unchanged",()=>{
  assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow,/test:migration-safety/);
  assert.doesNotMatch(workflow,/^\s*(push|schedule|pull_request):/m);
  assert.doesNotMatch(workflow,/wrangler deploy|d1 time-travel restore/);
  assert.ok(workflow.includes("- "+target));
  const match=workflow.match(/      - name: Require main and explicit production confirmation\n        shell: bash\n        run: \|\n([\s\S]*?)\n      - name: Checkout exact dispatched main revision/);
  assert.ok(match,"missing guarded approval step");
  const bash=match[1].split("\n").map(line=>line.replace(/^          /,"")).join("\n");
  const tmp=mkdtempSync(path.join(os.tmpdir(),"psipedia-d1-0128-"));
  try{
    const event=path.join(tmp,"event.json");
    const run=(confirmation,migration=target,ref="refs/heads/main")=>{
      writeFileSync(event,JSON.stringify({inputs:{confirmation}}));
      return spawnSync("bash",["-e","-c",bash],{encoding:"utf8",env:{...process.env,TARGET_MIGRATION:migration,GITHUB_REF:ref,GITHUB_EVENT_PATH:event}});
    };
    assert.equal(run("APPLY-0128-psipedia-sk-db").status,0);
    assert.notEqual(run("APPLY-0127-psipedia-sk-db").status,0);
    assert.notEqual(run("APPLY-0128-wrong-db").status,0);
    assert.notEqual(run("APPLY-0128-psipedia-sk-db",target,"refs/heads/feature").status,0);
    assert.notEqual(run("APPLY-0128-psipedia-sk-db","0128_fake.sql").status,0);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test("0128 ledger requires exact 0127 predecessor, only one pending migration, no gaps and no repeat",()=>{
  const names=[...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_fixture.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS,"0132_future.sql"];
  const selected=selectMigrationsThrough(names,target);
  assert.equal(selected.selected.at(-1),target);
  assert.deepEqual(selected.excludedFuture,["0129_gemini_external_manual_queue.sql","0130_facebook_image_publisher.sql","0131_facebook_image_trash.sql","0132_future.sql"]);
  const prior=selected.selected.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(prior,selected.selected,target),{latestIndex:127,targetApplied:false});
  assert.throws(()=>validateProductionTargetHistory(prior.slice(0,-1),selected.selected,target),/expected exactly 0127/);
  const bad=[...prior];bad[127]="0127_other.sql";
  assert.throws(()=>validateProductionTargetHistory(bad,selected.selected,target),/does not exactly match/);
  assert.deepEqual(validateProductionTargetHistory([...prior,target],selected.selected,target),{latestIndex:128,targetApplied:true});
  assert.throws(()=>assert0128NotAlreadyApplied(target,true),/already applied/);
  assert.doesNotThrow(()=>assert0128NotAlreadyApplied(target,false));
  assert.doesNotThrow(()=>assert0128NotAlreadyApplied(previous,true));
});

test("0128 SQL is additive and enforces table columns, checks, indexes and empty initial state",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    const objects=()=>({objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')").all()});
    assert.deepEqual(targetSchemaObjects(objects(),target),{partial:false});
    db.exec(source.toString("utf8"));
    assert.deepEqual(targetSchemaObjects(objects(),target),{partial:true});
    assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(objects(),target)),/partial\/manual drift/);
    assert.doesNotThrow(()=>assertFacebookImagePostsSchema(objects()));
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM facebook_image_posts").get().total,0);
    const base="INSERT INTO facebook_image_posts(id,title,image_url,image_key,created_at,updated_at,created_by,updated_by";
    const suffix=") VALUES ('id','test','','','2026-10-15','2026-10-15','test','test'";
    db.exec(base+suffix+")");
    assert.throws(()=>db.exec("INSERT INTO facebook_image_posts(id,title,scheduled_at,created_at,updated_at,created_by,updated_by,status) VALUES ('no-image','t','2026-10-15T12:00:00Z','a','a','a','a','scheduled')"),/CHECK constraint failed/);
    const invalid=structuredClone(objects());
    invalid.objects.find(x=>x.name==="facebook_image_posts_schedule_idx").sql="CREATE INDEX facebook_image_posts_schedule_idx ON facebook_image_posts(status)";
    assert.throws(()=>assertFacebookImagePostsSchema(invalid),/index schema drift/);
  }finally{db.close();}
});
