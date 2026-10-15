import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  runFacebookImagePublishSweep,setPublisherEnabled,setIndividualApproval,publisherConfig,
  publishPhotoToMeta,publisherConfigured,
} from "../lib/facebook-image-publisher.ts";

const migration128=readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
const migration129=readFileSync(new URL("../drizzle/0129_facebook_image_publisher.sql",import.meta.url),"utf8");
const bindings={FB_PAGE_ID:"123456789012345",FB_PAGE_ACCESS_TOKEN:"FAKE_TEST_TOKEN_DO_NOT_USE_ABCDEF",FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"};
const date="2030-02-10T12:00:00.000Z", now=new Date(date);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture() {
 const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON");sqlite.exec(migration128);sqlite.exec(migration129);
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
test("global OFF allows only independently approved post, claims it once and stores the Meta ID",async()=>{
 const f=fixture();try {
   f.add(1);f.add(2);
   const ok=await setIndividualApproval(f.db,id(1),1,true,"admin@example.test");
   assert.equal(ok.version,2);
   const calls=[];
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
test("global ON publishes arbitrary same-time due posts without time windows or item quotas",async()=>{
 const f=fixture();try{
   f.add(1);f.add(2);f.add(3,"UNREVIEWED","2030-02-10T12:01:00.000Z");
   await setPublisherEnabled(f.db,true,"admin@example.test");
   const calls=[];
   const result=await runFacebookImagePublishSweep({db:f.db,bindings,now,fetcher:fakeMeta(calls)});
   assert.equal(result.published,2);assert.equal(calls.length,2);
   assert.equal(f.attempt(3),undefined);
   assert.equal((await publisherConfig(f.db,bindings)).enabled,true);
 }finally{f.close();}
});
test("failed/ambiguous Meta call remains UNCERTAIN forever; automatic retries and concurrent duplicates are impossible",async()=>{
 const f=fixture();try{
   f.add(1,"APPROVED");
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
   f.add(1);await setPublisherEnabled(f.db,true,"admin@example.test");
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
