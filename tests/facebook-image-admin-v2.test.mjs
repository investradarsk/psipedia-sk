import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {permanentlyDeleteFacebookImage,facebookTrashSchemaReady} from "../lib/facebook-image-trash.ts";
import {runFacebookImagePublishSweep,setPublisherEnabled,setDirectPublishConsent} from "../lib/facebook-image-publisher.ts";
import {runNotionFacebookImagesSync,NOTION_FACEBOOK_IMAGES_SOURCE_ID} from "../lib/notion-facebook-images-sync.ts";
import {listFacebookImagePosts,getFacebookImagePost} from "../lib/facebook-image-store.ts";

const paths=["0128_facebook_image_posts.sql","0130_facebook_image_publisher.sql",
  "0131_facebook_image_trash.sql","0132_facebook_image_direct_consent.sql"];
const now=new Date("2030-01-02T10:00:00.000Z"),ts=now.toISOString();
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const imageKey=n=>"facebook-images/2030/"+id(n)+".jpg";
const pageId="3e0793fc-1d18-8138-8bb7-f0e0a7495728";
function fixture(full=true) {
  const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON;");
  for(const [i,file] of paths.entries())if(full||i<2)
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
  const remove=(n,version=1)=>permanentlyDeleteFacebookImage({db,id:id(n),expectedVersion:version,actor:"owner"});
  return {sqlite,db,add,post,remove,close:()=>sqlite.close()};
}
test("0131 tombstone and 0132 consent are additive; old D1 does not expose delete",async()=>{
  const old=fixture(false),f=fixture();
  try {
    assert.equal(await facebookTrashSchemaReady(old.db),false);
    assert.equal(await facebookTrashSchemaReady(f.db),true);
    f.add(1);assert.equal(f.post(1).deleted_at,null);
    assert.equal(f.post(1).direct_publish_consent,0);
    await assert.rejects(old.remove(1),/migráci/);
    assert.equal((await listFacebookImagePosts("2030-01","all",1,old.db)).trashAvailable,false);
  }finally{old.close();f.close();}
});
test("permanent deletion hides an approved scheduled post, revokes both permissions and blocks Meta",async()=>{
  const f=fixture();try {
    f.add(1);f.add(2);
    await setDirectPublishConsent(f.db,id(1),1,true,"owner");
    await setPublisherEnabled(f.db,true,"admin");
    const deleted=await f.remove(1,2);
    assert.equal(deleted.version,3);assert.ok(f.post(1).deleted_at);
    assert.equal(f.post(1).approval_status,"UNREVIEWED");
    assert.equal(f.post(1).direct_publish_consent,0);
    await assert.rejects(f.remove(1,3),/zmenil/);
    const calls=[];
    const publisher={FB_PAGE_ID:"123456789",FB_PAGE_ACCESS_TOKEN:"SYNTHETIC_FAKE_TEST_ONLY_TOKEN_LONG",FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"};
    const result=await runFacebookImagePublishSweep({db:f.db,bindings:publisher,now,
      fetcher:async(_url,opts)=>{calls.push(opts.body);return Response.json({id:"99887766"});}});
    assert.equal(result.published,1);assert.equal(calls.length,1);
    assert.equal(f.post(1).status,"scheduled");assert.equal(f.post(2).status,"published");
    const listed=await listFacebookImagePosts("2030-01","all",1,f.db);
    assert.equal(listed.total,1);assert.equal(listed.counts.published,1);
    assert.equal(listed.calendar.some(p=>p.id===id(1)),false);
    const tombstone=await getFacebookImagePost(id(1),f.db);
    assert.equal(tombstone.deletedAt,f.post(1).deleted_at);
  }finally{f.close();}
});
test("SENDING cannot be removed; UNCERTAIN may be hidden without losing attempt evidence",async()=>{
  const f=fixture();try {
    f.add(1);
    f.sqlite.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,state,started_at) VALUES(?,1,'SENDING',?)").run(id(1),ts);
    await assert.rejects(f.remove(1),/zmenil/);
    assert.equal(f.post(1).deleted_at,null);
    f.sqlite.prepare("UPDATE facebook_image_publish_attempts SET state='UNCERTAIN',completed_at=?,error_code='TIMEOUT' WHERE post_id=?").run(ts,id(1));
    await f.remove(1);
    assert.ok(f.post(1).deleted_at);
    assert.equal(f.sqlite.prepare("SELECT state FROM facebook_image_publish_attempts WHERE post_id=?").get(id(1)).state,"UNCERTAIN");
    assert.equal((await listFacebookImagePosts("2030-01","review",1,f.db)).total,0);
  }finally{f.close();}
});
test("published Meta post metadata survives admin deletion; no Facebook deletion happens",async()=>{
  const f=fixture();try {
    f.add(1,{status:"published"});
    f.sqlite.prepare("UPDATE facebook_image_posts SET facebook_post_id='123_456',published_at=? WHERE id=?").run(ts,id(1));
    f.sqlite.prepare("INSERT INTO facebook_image_publish_attempts(post_id,snapshot_version,state,started_at,remote_id,completed_at) VALUES(?,1,'PUBLISHED',?,?,?)")
      .run(id(1),ts,"123_456",ts);
    await f.remove(1);
    assert.equal(f.post(1).facebook_post_id,"123_456");
    assert.equal(f.sqlite.prepare("SELECT remote_id FROM facebook_image_publish_attempts WHERE post_id=?").get(id(1)).remote_id,"123_456");
    assert.equal((await listFacebookImagePosts("2030-01","published",1,f.db)).total,0);
  }finally{f.close();}
});
test("Notion sync never reimports a deleted canonical page",async()=>{
  const f=fixture();const originalFetch=globalThis.fetch;
  try {
    f.add(1,{status:"draft",approval:"UNREVIEWED",notion:pageId});
    await f.remove(1);
    const page={id:pageId,properties:{
      "Názov":{title:[{plain_text:"Môj obrázok"}]},
      "Text na Facebook":{rich_text:[{plain_text:"Text"}]},
      "Stav":{status:{name:"Schválené"}},
      "Povoliť publikovanie":{checkbox:true},
      "Súhlas majiteľa – priame publikovanie":{checkbox:true},
      "Dátum a čas publikovania":{date:{start:"2030-01-02T13:00:00+01:00"}},
      "Obrázok":{files:[{id:"f",type:"file",file:{url:"https://example.test/file.jpg"}}]},
    }};
    const calls=[];
    globalThis.fetch=async(url)=>{
      calls.push(String(url));
      if(String(url).endsWith("/query"))return Response.json({results:[page],has_more:false});
      throw new Error("No media fetch, publication or Notion PATCH for deleted post");
    };
    const summary=await runNotionFacebookImagesSync({database:f.db,
      bindings:{NOTION_API_TOKEN:"FAKE",NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID:NOTION_FACEBOOK_IMAGES_SOURCE_ID,
        NOTION_FACEBOOK_IMAGES_SYNC_ENABLED:"true",BUCKET:{}},now});
    assert.equal(summary.unchanged,1);
    assert.equal(summary.created,0);assert.equal(summary.updated,0);
    assert.equal(calls.length,1);assert.ok(f.post(1).deleted_at);
  }finally{globalThis.fetch=originalFetch;f.close();}
});
