import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  runFacebookImagePublishSweep,setPublisherEnabled,setIndividualApproval,publisherConfig,
  publishPhotoToMeta,publisherConfigured,setDirectPublishConsent,
} from "../lib/facebook-image-publisher.ts";

const migration128=readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
const migration129=readFileSync(new URL("../drizzle/0130_facebook_image_publisher.sql",import.meta.url),"utf8");
const migration131=readFileSync(new URL("../drizzle/0131_facebook_image_trash.sql",import.meta.url),"utf8");
const migration132=readFileSync(new URL("../drizzle/0132_facebook_image_direct_consent.sql",import.meta.url),"utf8");
const bindings={FB_PAGE_ID:"123456789012345",FB_PAGE_ACCESS_TOKEN:"FAKE_TEST_TOKEN_DO_NOT_USE_ABCDEF",FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"};
const date="2030-02-10T12:00:00.000Z", now=new Date(date);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture() {
 const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON");sqlite.exec(migration128);sqlite.exec(migration129);sqlite.exec(migration131);sqlite.exec(migration132);
 function wrap(statement,args=[]){return {
   bind(...params){return wrap(statement,params)},first(){return statement.get(...args)??null},
   all(){return {results:statement.all(...args)}},run(){return statement.run(...args)}
 }}
 const db={prepare(sql){return wrap(sqlite.prepare(sql))}};
 function add(n,approval="UNREVIEWED",scheduled_at="2030-02-10T11:59:00.000Z",status="scheduled"){
   sqlite.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,approval_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
     .run(id(n),"Test "+n,`/media/facebook-images/2030/${id(n)}.jpg`,`facebook-images/2030/${id(n)}.jpg`,
       "Toto je pôvodný popis "+n,scheduled_at,status,approval,date,date,"admin","admin");
 }
 const attempt=n=>sqlite.prepare("SELECT * FROM facebook_image_publish_attempts WHERE post_id=?").get(id(n));
 const post=n=>sqlite.prepare("SELECT * FROM facebook_image_posts WHERE id=?").get(id(n));
 return {sqlite,db,add,attempt,post,close:()=>sqlite.close()};
}
function fakeMeta(calls){
 return async(url,options)=>{
   calls.push({url,method:options.method,headers:options.headers,body:options.body});
   return Response.json({id:"99887766554433",post_id:"123456789012345_99887766554433"});
 };
}
test("prepared 0129 is additive, defaults global OFF, no credentials or publication",async()=>{
 const f=fixture();
 try {
   assert.equal((await publisherConfig(f.db,bindings)).enabled,false);
   assert.equal(publisherConfigured({}),false);
   assert.equal(publisherConfigured({...bindings,FACEBOOK_IMAGE_PUBLISH_ENABLED:"false"}),false);
   f.add(1);
   const calls=[];
   const disabled=await runFacebookImagePublishSweep({db:f.db,bindings:{},now,fetcher:fakeMeta(calls)});
   assert.deepEqual({claimed:disabled.claimed,published:disabled.published},{claimed:0,published:0});
   const summary=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(summary.claimed,0);assert.equal(calls.length,0);
   assert.equal(f.attempt(1),undefined);
 }finally{f.close();}
});
test("global STOP blocks approved post; global ON then sends it exactly once",async()=>{
 const f=fixture();try {
   f.add(1);f.add(2);
   const ok=await setIndividualApproval(f.db,id(1),1,true,"admin@example.test");
   assert.equal(ok.version,2);
   const calls=[];
   const blocked=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(blocked.published,0);assert.equal(calls.length,0);
   assert.equal(f.attempt(1),undefined);
   await setPublisherEnabled(f.db,true,"admin@example.test");
   const summary=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(summary.published,1);assert.equal(calls.length,1);
   assert.equal(calls[0].url,"https://graph.facebook.com/v26.0/123456789012345/photos");
   assert.equal(new URLSearchParams(calls[0].body).get("url"),`https://psipedia.sk/media/facebook-images/2030/${id(1)}.jpg`);
   assert.equal(new URLSearchParams(calls[0].body).get("caption"),"Toto je pôvodný popis 1");
   assert.equal(calls[0].url.includes(bindings.FB_PAGE_ACCESS_TOKEN),false);
   assert.equal(f.attempt(1).state,"PUBLISHED");assert.equal(f.post(1).status,"published");
   assert.equal(f.post(1).facebook_post_id,"123456789012345_99887766554433");
   assert.equal(f.attempt(2),undefined);
   assert.equal((await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)})).claimed,0);
   assert.equal(calls.length,1);
 }finally{f.close();}
});
test("global ON never publishes unapproved posts or not-yet-due posts",async()=>{
 const f=fixture();try{
   f.add(1,"APPROVED");f.add(2);f.add(3,"APPROVED","2030-02-10T12:01:00.000Z");
   await setPublisherEnabled(f.db,true,"admin@example.test");
   const calls=[];
   const result=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(result.published,1);assert.equal(calls.length,1);
   assert.equal(f.attempt(2),undefined);
   assert.equal(f.attempt(3),undefined);
   assert.equal((await publisherConfig(f.db,bindings)).enabled,true);
 }finally{f.close();}
});
test("failed/ambiguous Meta call remains UNCERTAIN forever; automatic retries and concurrent duplicates are impossible",async()=>{
 const f=fixture();try{
   f.add(1,"APPROVED");
   await setPublisherEnabled(f.db,true,"admin");
   const calls=[];
   const fail=async()=>{calls.push("called");throw new Error("NETWORK_TIMEOUT");};
   const first=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fail});
   assert.equal(first.uncertain,1);assert.equal(f.attempt(1).state,"UNCERTAIN");
   const parallel=await Promise.all([
     runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)}),
     runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)}),
   ]);
   assert.deepEqual(parallel.map(x=>x.claimed),[0,0]);
   assert.equal(calls.length,1);
   await assert.rejects(()=>setIndividualApproval(f.db,id(1),1,false,"admin@example.test"),/zmenil|odosiela/);
 }finally{f.close();}
});
test("concurrent publisher runs use a unique SQL claim, never two outbound API calls",async()=>{
 const f=fixture();try{
   f.add(1,"APPROVED");await setPublisherEnabled(f.db,true,"admin@example.test");
   const calls=[],transport=fakeMeta(calls);
   const both=await Promise.all([
     runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:transport}),
     runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:transport}),
   ]);
   assert.equal(both.reduce((n,x)=>n+x.claimed,0),1);
   assert.equal(calls.length,1);
 }finally{f.close();}
});
test("invalid credentials or malicious image key never initiate Meta request",async()=>{
 let called=false;
 await assert.rejects(()=>publishPhotoToMeta({imageKey:"https://other.tld/x.png",caption:"x"},bindings,async()=>{called=true;return Response.json({id:"1"});}),/IMAGE_KEY_INVALID/);
 await assert.rejects(()=>publishPhotoToMeta({imageKey:"facebook-images/2030/aaa.jpg",caption:"x"},{},async()=>{called=true;return Response.json({id:"1"});}),/NOT_CONFIGURED/);
 assert.equal(called,false);
});

test("direct owner consent does NOT grant scheduled approval or bypass global STOP",async()=>{
 const f=fixture();try {
   f.add(1);
   const allowed=await setDirectPublishConsent(f.db,id(1),1,true,"owner@example.test");
   assert.equal(allowed.direct_publish_consent,1);
   assert.equal(f.post(1).approval_status,"UNREVIEWED");
   assert.equal(f.post(1).direct_publish_consent,1);
   const calls=[];
   await setPublisherEnabled(f.db,true,"owner@example.test");
   assert.equal((await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)})).published,0);
   assert.equal(calls.length,0);
   const withdrawn=await setDirectPublishConsent(f.db,id(1),2,false,"owner@example.test");
   assert.equal(withdrawn.direct_publish_consent,0);
   assert.equal(f.post(1).direct_consent_by,null);
 }finally{f.close();}
});
test("STOP toggled after SQL claim but before Meta call releases unsubmitted claim",async()=>{
 const f=fixture();try{
   f.add(1,"APPROVED");
   await setPublisherEnabled(f.db,true,"owner");
   const original=f.db.prepare.bind(f.db);
   f.db.prepare=(sql)=>{
     const statement=original(sql);
     if(!sql.includes("INSERT OR IGNORE INTO facebook_image_publish_attempts"))return statement;
     return {bind(...a){const bound=statement.bind(...a);return {
       async first(){const result=await bound.first();
         f.sqlite.prepare("UPDATE facebook_image_publisher_settings SET enabled=0 WHERE id=1").run();
         return result;}
     };}};
   };
   const calls=[],result=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(result.published,0);assert.equal(calls.length,0);
   assert.equal(f.attempt(1),undefined);
   assert.equal(f.post(1).status,"scheduled");
 }finally{f.close();}
});
