import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {geminiAutomationCatalog} from "../lib/gemini-automation-catalog.ts";
import {
  GEMINI_BACKGROUND_TIMEOUT_MS,geminiManualBackgroundEnabled,
  enqueueGeminiManualBackgroundJob,listGeminiManualBackgroundJobs,
  runGeminiManualBackgroundSweep,
} from "../lib/gemini-automation-background-queue.ts";

const env={GEMINI_API_KEY:"MOCK_ONLY",GEMINI_MODEL:"gemini-3.8-flash"};
function fakeDb() {
  const jobs=[];
  const statements=[];
  const db={prepare(sql){
    statements.push(sql);
    let params=[];
    const stmt={
      bind(...values){params=values;return stmt},
      async first() {
        if(sql.includes("FROM gemini_automation_settings"))return{id:4,max_new_concepts:1};
        if(sql.includes("status='RUNNING' LIMIT 1"))
          return jobs.find(job=>job.status==="RUNNING")??null;
        if(sql.includes("status='QUEUED' ORDER BY"))
          return jobs.find(job=>job.status==="QUEUED")??null;
        return null;
      },
      async all() {return{results:jobs.slice().reverse()}},
      async run() {
        if(sql.includes("INSERT INTO gemini_manual_background_jobs")) {
          if(jobs.some(job=>["QUEUED","RUNNING"].includes(job.status)))
            return{meta:{changes:0,last_row_id:0}};
          const job={id:jobs.length+1,stable_key:params[1],status:"QUEUED",run_id:null,
            error_code:null,created_at:"2026-10-11T15:00:00Z",claimed_at:null,completed_at:null};
          jobs.push(job);
          return{meta:{changes:1,last_row_id:job.id}};
        }
        if(sql.includes("SET status='RUNNING'")) {
          const job=jobs.find(j=>j.id===params[1]&&j.status==="QUEUED");
          if(!job)return{meta:{changes:0}};
          job.status="RUNNING";job.claimed_at=params[0];
          return{meta:{changes:1}};
        }
        if(sql.includes("SET status=?,run_id=?")) {
          const job=jobs.find(j=>j.id===params[4]&&j.status==="RUNNING");
          if(!job)return{meta:{changes:0}};
          job.status=params[0];job.run_id=params[1];job.error_code=params[2];job.completed_at=params[3];
          return{meta:{changes:1}};
        }
        if(sql.includes("SET status='FAILED'")) {
          const job=jobs.find(j=>j.id===params[1]&&j.status==="RUNNING");
          if(!job)return{meta:{changes:0}};
          job.status="FAILED";job.error_code="PROCESSING_ERROR";job.completed_at=params[0];
          return{meta:{changes:1}};
        }
        throw Error("Unexpected fake SQL: "+sql);
      }
    };
    return stmt;
  }};
  return{db,jobs,statements};
}

test("catalog exposes 22 categories but help explicitly awaits safe bridge",async()=>{
  assert.equal(geminiAutomationCatalog.length,22);
  assert.equal(geminiAutomationCatalog.filter(v=>v.section==="directory").length,10);
  assert.equal(geminiAutomationCatalog.filter(v=>v.section==="events").length,6);
  assert.equal(geminiAutomationCatalog.filter(v=>v.section==="help").length,6);
  assert.equal(geminiManualBackgroundEnabled({GEMINI_ASYNC_MANUAL_ENABLED:"false"}),false);
  assert.equal(geminiManualBackgroundEnabled({GEMINI_ASYNC_MANUAL_ENABLED:"true"}),true);
  const {db}=fakeDb();
  await assert.rejects(enqueueGeminiManualBackgroundJob({database:db,env,stableKey:"help.adopcia"}),
    error=>error.code==="PILOT_INVALID_SCOPE");
});

test("manual Event job is accepted without invoking provider and exactly once",async()=>{
  const {db,jobs}=fakeDb();
  const first=await enqueueGeminiManualBackgroundJob({database:db,env,stableKey:"events.vystavy"});
  assert.deepEqual(first,{jobId:1,status:"QUEUED"});
  assert.equal(jobs.length,1);
  await assert.rejects(enqueueGeminiManualBackgroundJob({database:db,env,stableKey:"directory.fyzioterapia"}),
    error=>error.code==="PILOT_ALREADY_RUNNING");
  assert.equal((await listGeminiManualBackgroundJobs(db))[0].status,"QUEUED");
  const calls=[];
  const summary=await runGeminiManualBackgroundSweep({database:db,env,
    executeEvent:async request=>{
      calls.push(request);
      return{runId:91,status:"SUCCESS",candidateCount:1,duplicateCount:0,conceptCount:1};
    },
  });
  assert.deepEqual(summary,{claimed:1,processed:1,succeeded:1,failed:0,blocked:0});
  assert.equal(calls.length,1);
  assert.equal(calls[0].timeoutMs,300000);
  assert.equal(calls[0].stableKey,"events.vystavy");
  assert.equal(jobs[0].status,"SUCCESS");
  assert.equal(jobs[0].run_id,91);
  const second=await runGeminiManualBackgroundSweep({database:db,env,executeEvent:async()=>{throw Error("duplicate charge")}});
  assert.equal(second.claimed,0);
});

test("directory uses the same queue; unknown outcome never triggers automatic retry",async()=>{
  const {db,jobs}=fakeDb();
  await enqueueGeminiManualBackgroundJob({database:db,env,stableKey:"directory.fyzioterapia"});
  let calls=0;
  const x=await runGeminiManualBackgroundSweep({database:db,env,executeDirectory:async request=>{
    calls++; assert.equal(request.timeoutMs,GEMINI_BACKGROUND_TIMEOUT_MS);throw Error("uncertain provider");
  }});
  assert.equal(calls,1);
  assert.equal(x.failed,1);
  assert.equal(jobs[0].error_code,"PROCESSING_ERROR");
  assert.equal(jobs[0].status,"FAILED");
  const again=await runGeminiManualBackgroundSweep({database:db,env,executeDirectory:async()=>{calls++;}});
  assert.equal(calls,1);
  assert.equal(again.claimed,0);
});

test("Cron is manual-queue-only and scheduler stays disabled by default",()=>{
  const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/admin/gemini-automation/run/route.ts",import.meta.url),"utf8");
  const wrangler=readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../drizzle/0119_gemini_manual_background_jobs.sql",import.meta.url),"utf8");
  assert.match(worker,/geminiManualBackgroundEnabled\(env\)/);
  assert.match(worker,/runGeminiManualBackgroundSweep/);
  assert.match(route,/status:202/);
  assert.match(wrangler,/"GEMINI_ASYNC_MANUAL_ENABLED": "false"/);
  assert.match(migration,/idx_gemini_manual_only_one_active/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS gemini_manual_background_jobs/);
});
