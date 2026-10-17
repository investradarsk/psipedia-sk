import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {runNotionFacebookImagesSync,NOTION_FACEBOOK_IMAGES_SOURCE_ID} from "../lib/notion-facebook-images-sync.ts";
import {runFacebookImagePublishSweep} from "../lib/facebook-image-publisher.ts";

const migrations=["drizzle/0128_facebook_image_posts.sql","drizzle/0130_facebook_image_publisher.sql"];
const time=new Date("2030-01-02T10:00:00.000Z");
const pageId="3e0793fc-1d18-8138-8bb7-f0e0a7495728";
const imageBytes=Uint8Array.from([0xff,0xd8,0xff,0xe0,0x11,0x22,0x33]);
const bindings={
  NOTION_API_TOKEN:"TEST_FAKE_NOTION_TOKEN",
  NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID:NOTION_FACEBOOK_IMAGES_SOURCE_ID,
  NOTION_FACEBOOK_IMAGES_SYNC_ENABLED:"true",
};
function notionPage(approved=true){
  return {
    id:pageId,
    properties:{
      "Názov":{title:[{plain_text:"Test Psipedia Notion"}]},
      "Text na Facebook":{rich_text:[{plain_text:"Jedna fotografia psa"}]},
      "Stav":{status:{name:approved?"Schválené":"Koncept"}},
      "Povoliť publikovanie":{checkbox:approved},
      "Dátum a čas publikovania":{date:{start:"2030-01-02T12:00:00+01:00"}},
      "Obrázok":{files:[{id:"file-123",type:"file",file:{url:"https://s3.example.test/dog.jpg?token=SIGNED"}}]},
      "Facebook URL":{url:null},
      "Facebook Post ID":{rich_text:[]},
      "Chyba publikovania":{rich_text:[]},
    },
  };
}
function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for(const migration of migrations)sqlite.exec(readFileSync(new URL("../"+migration,import.meta.url),"utf8"));
  function bound(sql,params=[]){
    return {
      bind(...v){return bound(sql,v);},
      first(){return sqlite.prepare(sql).get(...params)??null;},
      all(){return {results:sqlite.prepare(sql).all(...params)};},
      run(){const result=sqlite.prepare(sql).run(...params);return {meta:{changes:result.changes}};},
    };
  }
  const db={prepare(sql){return bound(sql)}};
  const objects=new Map();
  const bucket={
    head:async key=>objects.get(key)?.head??null,
    put:async(key,bytes,meta)=>{objects.set(key,{bytes,head:{customMetadata:meta.customMetadata,
      httpMetadata:meta.httpMetadata}});},
  };
  const get=()=>sqlite.prepare("SELECT * FROM facebook_image_posts WHERE notion_page_id=?").get(pageId);
  return {sqlite,db,bucket,objects,get,close:()=>sqlite.close()};
}
async function mockedNotion(page,callback){
  const old=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,init={})=>{
    calls.push({url:String(url),method:init.method});
    if(String(url).endsWith("/query"))return Response.json({results:[page],has_more:false});
    if(String(url).includes("s3.example.test"))return new Response(imageBytes,{
      headers:{"content-type":"image/jpeg","content-length":String(imageBytes.byteLength)},
    });
    if(String(url).includes("/pages/"))return Response.json({id:pageId});
    throw Error("Unexpected network request "+url);
  };
  try{return await callback(calls);}finally{globalThis.fetch=old;}
}
test("sync flag off reads no Notion and writes no D1",async()=>{
  const f=fixture();try {
    const result=await runNotionFacebookImagesSync({
      database:f.db,bindings:{...bindings,BUCKET:f.bucket,NOTION_FACEBOOK_IMAGES_SYNC_ENABLED:"false"},
      now:time,
    });
    assert.equal(result.enabled,false);assert.equal(result.created,0);
    assert.equal(f.get(),undefined);
  }finally{f.close();}
});
test("Notion approval creates only a draft, with no D1 publishing permission",async()=>{
  const f=fixture();const page=notionPage();
  try {
    await mockedNotion(page,async calls=>{
      const one=await runNotionFacebookImagesSync({database:f.db,
        bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(one.created,1);assert.equal(one.failed,0);assert.equal(one.invalid,0);
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().approval_status,"UNREVIEWED");
      assert.equal(f.get().caption,"Jedna fotografia psa");
      assert.match(f.get().image_key,/^facebook-images\/\d{4}\/[a-f0-9-]+\.jpg$/);
      assert.equal(f.objects.size,1);
      const two=await runNotionFacebookImagesSync({database:f.db,
        bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(two.unchanged,1);assert.equal(f.objects.size,1);
      assert.equal(calls.filter(c=>c.url.includes("s3.example.test")).length,1);
    });
  }finally{f.close();}
});
test("unchecked or draft Notion data never publishes even when broad Facebook toggle is off",async()=>{
  const f=fixture();const page=notionPage(false);
  try {
    await mockedNotion(page,async()=>{
      const summary=await runNotionFacebookImagesSync({database:f.db,
        bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(summary.created,1);
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().approval_status,"UNREVIEWED");
      const publisher=await runFacebookImagePublishSweep({db:f.db,now:time,
        bindings:{FB_PAGE_ID:"1172082959332114",FB_PAGE_ACCESS_TOKEN:"FAKE_FAKE_FAKE_FAKE_FAKE_TOKEN",FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"},
        fetcher:async()=>{throw Error("Should never be called");}});
      assert.equal(publisher.claimed,0);
    });
  }finally{f.close();}
});
test("published D1 record writes back to Notion once and cannot reimport",async()=>{
  const f=fixture();const page=notionPage();
  try {
    await mockedNotion(page,async calls=>{
      await runNotionFacebookImagesSync({database:f.db,
        bindings:{...bindings,BUCKET:f.bucket},now:time});
      f.sqlite.prepare("UPDATE facebook_image_posts SET status='published',facebook_post_id=?,published_at=? WHERE notion_page_id=?")
        .run("1172082959332114_99887766",time.toISOString(),pageId);
      const result=await runNotionFacebookImagesSync({database:f.db,
        bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(result.writtenBack,1);
      assert.equal(f.objects.size,1);
      assert.equal(calls.filter(c=>c.url.includes("/pages/")).length,1);
    });
  }finally{f.close();}
});

test("Notion import preserves newer manual admin edits without re-approving publication",async()=>{
  const f=fixture(),page=notionPage(true);
  try {
    await mockedNotion(page,async()=>{
      const first=await runNotionFacebookImagesSync({
        database:f.db,bindings:{...bindings,BUCKET:f.bucket},now:time,
      });
      assert.equal(first.created,1);
      const oldHash=f.get().sync_hash;
      f.sqlite.prepare("UPDATE facebook_image_posts SET caption=?,approval_status='UNREVIEWED',version=version+1,updated_by=? WHERE notion_page_id=?")
        .run("Novší text z administrácie","editor@psipedia.sk",pageId);
      page.properties["Text na Facebook"].rich_text=[{plain_text:"Staršia verzia v Notione"}];
      const imported=await runNotionFacebookImagesSync({
        database:f.db,bindings:{...bindings,BUCKET:f.bucket},now:time,
      });
      assert.equal(imported.updated,0);
      assert.equal(imported.unchanged,1);
      assert.equal(imported.failed,0);
      assert.equal(f.get().caption,"Novší text z administrácie");
      assert.equal(f.get().approval_status,"UNREVIEWED");
      assert.equal(f.get().updated_by,"editor@psipedia.sk");
      assert.equal(f.get().sync_hash,oldHash);
      assert.equal(f.objects.size,1);
    });
  }finally{f.close();}
});

test("admin-authority keeps Notion-origin approvals as drafts until Psipedia admin approves",async()=>{
  const f=fixture(),page=notionPage(true);
  const authoritative={...bindings,BUCKET:f.bucket,
    NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED:"true"};
  try {
    await mockedNotion(page,async calls=>{
      const imported=await runNotionFacebookImagesSync({
        database:f.db,bindings:authoritative,now:time,
      });
      assert.equal(imported.adminExport.enabled,true);
      assert.equal(imported.created,1);
      assert.equal(imported.failed,0);
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().scheduled_at,null);
      assert.equal(f.get().approval_status,"UNREVIEWED");
      const noPublish=await runFacebookImagePublishSweep({
        db:f.db,now:time,
        bindings:{FB_PAGE_ID:"1172082959332114",
          FB_PAGE_ACCESS_TOKEN:"FAKE_FAKE_FAKE_FAKE_FAKE_TOKEN",
          FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"},
        fetcher:async()=>{throw Error("Notion approval must never trigger Meta publication in admin-authority mode");},
      });
      assert.equal(noPublish.claimed,0);
      const stable=await runNotionFacebookImagesSync({database:f.db,bindings:authoritative,now:time});
      assert.equal(stable.unchanged,1);
      assert.equal(f.objects.size,1);
      // Manual admin edit is authoritative: exporter updates existing Notion identity,
      // while the same Notion approval must not undo the admin change.
      f.sqlite.prepare("UPDATE facebook_image_posts SET caption=?,version=version+1,updated_by=? WHERE notion_page_id=?")
        .run("Nová verzia schválená v administrácii","editor@psipedia.sk",pageId);
      const afterAdmin=await runNotionFacebookImagesSync({
        database:f.db,bindings:authoritative,now:time,
      });
      assert.equal(afterAdmin.adminExport.updated,1);
      assert.equal(afterAdmin.updated,0);
      assert.equal(f.get().caption,"Nová verzia schválená v administrácii");
      assert.equal(f.get().approval_status,"UNREVIEWED");
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().notion_page_id,pageId);
      assert.equal(calls.filter(c=>c.url.includes("/pages/")&&c.method==="PATCH").length,1);
    });
  }finally{f.close();}
});

test("a changed Notion direct-consent checkbox is ignored by the D1 authorization gate",async()=>{
  const f=fixture(),page=notionPage(true);
  page.properties["Súhlas majiteľa – priame publikovanie"]={checkbox:true};
  try{
    await mockedNotion(page,async()=>{
      await runNotionFacebookImagesSync({database:f.db,bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().approval_status,"UNREVIEWED");
      page.properties["Súhlas majiteľa – priame publikovanie"].checkbox=false;
      await runNotionFacebookImagesSync({database:f.db,bindings:{...bindings,BUCKET:f.bucket},now:time});
      assert.equal(f.get().status,"draft");
      assert.equal(f.get().approval_status,"UNREVIEWED");
    });
  }finally{f.close();}
});
