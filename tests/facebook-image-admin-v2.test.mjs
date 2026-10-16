import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {setFacebookImageTrashed,facebookTrashSchemaReady} from "../lib/facebook-image-trash.ts";
import {runFacebookImagePublishSweep,setPublisherEnabled} from "../lib/facebook-image-publisher.ts";
import {runNotionFacebookImagesSync,NOTION_FACEBOOK_IMAGES_SOURCE_ID} from "../lib/notion-facebook-images-sync.ts";
import {listFacebookImagePosts,getFacebookImagePost} from "../lib/facebook-image-store.ts";

const paths=["0128_facebook_image_posts.sql","0130_facebook_image_publisher.sql","0131_facebook_image_trash.sql"];
const now=new Date("2030-01-02T10:00:00.000Z"),ts=now.toISOString();
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const imageKey=n=>"facebook-images/2030/"+id(n)+".jpg";
const pageId="3e0793fc-1d18-8138-8bb7-f0e0a7495728";
function fixture(trash=true) {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for(const [i,file] of paths.entries())if(trash||i<2)
    sqlite.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
  function wrap(sql,params=[]){
    return {
      bind(...args){return wrap(sql,args);},
      first(){return sqlite.prepare(sql).get(...params)??null;},
      all(){return {results:sqlite.prepare(sql).all(...params)};},
      run(){const v=sqlite.prepare(sql).run(...params);return {meta:{changes:v.changes}};},
    };
  }
  const db={prepare(sql){return wrap(sql)}};
  function add(n,opts={}) {
    sqlite.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,approval_status,notion_page_id,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id(n),"Post "+n,"/media/"+imageKey(n),imageKey(n),"Test",
        "2030-01-02T09:50:00.000Z",opts.status??"scheduled",
        opts.approval??"APPROVED",opts.notion??null,ts,ts,"tester","tester");
  }
  const post=n=>sqlite.prepare("SELECT * FROM facebook_image_posts WHERE id=?").get(id(n));
  return {sqlite,db,add,post,close:()=>sqlite.close()};
}
test("0131 is additive, existing rows and attempt ledger remain intact, and older DB safely reports trash unavailable",async()=>{
  const old=fixture(false),f=fixture();
  try {
    assert.equal(await facebookTrashSchemaReady(old.db),false);
    assert.equal(await facebookTrashSchemaReady(f.db),true);
    f.add(1);
    const before=f.post(1);
    assert.equal(before.deleted_at,null);
    assert.equal(before.deleted_by,null);
    assert.equal((await listFacebookImagePosts("2030-01","all",1,old.db)).trashAvailable,false);
  }finally{old.close();f.close();}
});
test("CAS trash removes planned post from the due queue; restore goes to draft with approval OFF",async()=>{
  const f=fixture();try {
    f.add(1);f.add(2);
    await setPublisherEnabled(f.db,true,"admin");
    await setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:1,action:"trash",actor:"admin"});
    assert.ok(f.post(1).deleted_at);
    assert.equal(f.post(1).approval_status,"UNREVIEWED");
    await assert.rejects(setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:1,action:"restore",actor:"admin"}));
    const requests=[];
    const fetcher=async(url,options)=>{
      requests.push(options.body);
      return Response.json({id:"9988776655443",post_id:"123456789_9988776655443"});
    };
    const b={FB_PAGE_ID:"123456789",FB_PAGE_ACCESS_TOKEN:"SYNTHETIC_FAKE_TEST_ONLY_TOKEN_LONG",
      FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"};
    const out=await runFacebookImagePublishSweep({db:f.db,bindings:b,now,fetcher});
    assert.equal(out.published,1);
    assert.equal(requests.length,1);
    assert.equal(f.post(1).status,"scheduled");
    assert.equal(f.post(2).status,"published");
    const restored=await setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:2,action:"restore",actor:"admin"});
    assert.equal(restored.version,3);
    assert.equal(f.post(1).deleted_at,null);
    assert.equal(f.post(1).status,"draft");
    assert.equal(f.post(1).approval_status,"UNREVIEWED");
    assert.equal((await runFacebookImagePublishSweep({db:f.db,bindings:b,now,fetcher})).published,0);
    const listed=await listFacebookImagePosts("2030-01","all",1,f.db);
    assert.equal(listed.total,2);
    assert.equal(listed.counts.published,1);
    assert.equal(listed.counts.draft,1);
  }finally{f.close();}
});
test("in-flight SENDING cannot be trashed; published record can be archived without deleting Facebook metadata",async()=>{
  const f=fixture();try {
    f.add(1);
    f.sqlite.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,state,started_at) VALUES(?,1,'SENDING',?)").run(id(1),ts);
    await assert.rejects(setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:1,action:"trash",actor:"admin"}));
    assert.equal(f.post(1).deleted_at,null);
    f.sqlite.prepare("UPDATE facebook_image_publish_attempts SET state='PUBLISHED',remote_id='123_456',completed_at=? WHERE post_id=?").run(ts,id(1));
    f.sqlite.prepare("UPDATE facebook_image_posts SET status='published',facebook_post_id='123_456',published_at=? WHERE id=?").run(ts,id(1));
    await setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:1,action:"trash",actor:"admin"});
    assert.equal(f.post(1).facebook_post_id,"123_456");
    assert.equal(f.sqlite.prepare("SELECT state FROM facebook_image_publish_attempts WHERE post_id=?").get(id(1)).state,"PUBLISHED");
    assert.equal((await listFacebookImagePosts("2030-01","trash",1,f.db)).total,1);
    assert.equal((await listFacebookImagePosts("2030-01","published",1,f.db)).total,0);
  }finally{f.close();}
});
test("Notion sync preserves deleted page tombstone; does not reimport or write back",async()=>{
  const f=fixture();const originalFetch=globalThis.fetch;
  try {
    f.add(1,{status:"draft",approval:"UNREVIEWED",notion:pageId});
    await setFacebookImageTrashed({db:f.db,id:id(1),expectedVersion:1,action:"trash",actor:"admin"});
    const page={id:pageId,properties:{
      "Názov":{title:[{plain_text:"Môj obrázok"}]},
      "Text na Facebook":{rich_text:[{plain_text:"Text"}]},
      "Stav":{status:{name:"Schválené"}},
      "Povoliť publikovanie":{checkbox:true},
      "Dátum a čas publikovania":{date:{start:"2030-01-02T13:00:00+01:00"}},
      "Obrázok":{files:[{id:"f",type:"file",file:{url:"https://example.test/file.jpg"}}]},
    }};
    const calls=[];
    globalThis.fetch=async(url,init={})=>{
      calls.push(String(url));
      if(String(url).endsWith("/query"))return Response.json({results:[page],has_more:false});
      throw new Error("No fetch of media, publish or Notion PATCH for trashed post");
    };
    const summary=await runNotionFacebookImagesSync({database:f.db,
      bindings:{NOTION_API_TOKEN:"FAKE",NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID:NOTION_FACEBOOK_IMAGES_SOURCE_ID,
        NOTION_FACEBOOK_IMAGES_SYNC_ENABLED:"true",BUCKET:{}},now});
    assert.equal(summary.unchanged,1);
    assert.equal(summary.created,0);
    assert.equal(summary.updated,0);
    assert.equal(calls.length,1);
    assert.ok(f.post(1).deleted_at);
  }finally{globalThis.fetch=originalFetch;f.close();}
});
