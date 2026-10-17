import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {adminExportAck,adminExportMarker,adminExportLeaseActive,
  facebookAdminNotionProperties,exportFacebookAdminChanges,shouldExportAdminImage,
} from "../lib/notion-facebook-images-admin-export.ts";
const SOURCE="2d945afe-0c79-467e-b9e6-6b0f62a27a49",PAGE="3fb793fc-1d18-8123-9abc-123456789000";
const POST="11111111-2222-4333-8444-555555555555",NOW="2030-01-02T09:00:00.000Z";
const settings={NOTION_API_TOKEN:"OFFLINE_FAKE_TOKEN",NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID:SOURCE,
  NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED:"true"};
function setup(){
  const sql=new DatabaseSync(":memory:");sql.exec("PRAGMA foreign_keys=ON;");
  for(const file of ["0128_facebook_image_posts.sql","0130_facebook_image_publisher.sql",
    "0131_facebook_image_trash.sql","0132_facebook_image_direct_consent.sql"])sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
  const db={prepare(stmt){let params=[];return {bind(...a){params=a;return this;},
    all(){return {results:sql.prepare(stmt).all(...params)};},
    first(){return sql.prepare(stmt).get(...params)??null;},
    run(){const r=sql.prepare(stmt).run(...params);return {meta:{changes:r.changes}};}};}};
  sql.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,version,approval_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(POST,"Hra pre psa","/media/facebook-images/2030/aabbccdd-1234-4567-890a-aabbccddeeff.png",
      "facebook-images/2030/aabbccdd-1234-4567-890a-aabbccddeeff.png",
      "Skúste hľadanie pamlskov.","2030-01-02T12:00:00.000Z","scheduled",1,"APPROVED",
      NOW,NOW,"admin@psipedia.sk","admin@psipedia.sk");
  return {sql,db,read:()=>sql.prepare("SELECT * FROM facebook_image_posts WHERE id=?").get(POST),
    close:()=>sql.close()};
}
function notionMock(){
  const old=globalThis.fetch,pages=new Map(),calls=[];let lostResponse=false,intervene=null;
  globalThis.fetch=async(url,opts={})=>{
    const path=String(url).replace("https://api.notion.com/v1",""),body=opts.body?JSON.parse(opts.body):{};
    calls.push({method:opts.method||"GET",path,body});
    if(path.endsWith("/query")){
      const marker=body.filter?.rich_text?.contains;
      const found=[...pages.values()].filter(x=>!x.in_trash&&x.note.includes(marker));
      return Response.json({results:found.map(({id})=>({id})),has_more:false});
    }
    if(path==="/pages"&&opts.method==="POST"){
      pages.set(PAGE,{id:PAGE,note:body.properties?.["Poznámka"]?.rich_text?.[0]?.text.content||"",
        properties:body.properties,in_trash:false});
      if(lostResponse){lostResponse=false;throw Error("Connection lost after Notion created page");}
      return Response.json({id:PAGE});
    }
    if(path==="/pages/"+PAGE&&(!opts.method||opts.method==="GET")){
      const p=pages.get(PAGE);
      return p?Response.json({id:PAGE,in_trash:p.in_trash,archived:p.in_trash}):
        Response.json({message:"Not found"},{status:404});
    }
    if(path==="/pages/"+PAGE&&opts.method==="PATCH"){
      if(intervene){const callback=intervene;intervene=null;callback();}
      const p=pages.get(PAGE);if(!p)return Response.json({message:"Not found"},{status:404});
      if(typeof body.in_trash==="boolean")p.in_trash=body.in_trash;
      if(body.properties)p.properties={...p.properties,...body.properties};
      return Response.json({id:PAGE,in_trash:p.in_trash});
    }
    throw Error("Unexpected URL "+path);
  };
  return {pages,calls,loseNextCreate(){lostResponse=true;},
    onNextPatch(fn){intervene=fn;},restore(){globalThis.fetch=old;}};
}
test("export flag disabled: no Notion calls or D1 writes",async()=>{
  const mock=notionMock(),f=setup();
  try{const out=await exportFacebookAdminChanges({db:f.db,bindings:{...settings,
    NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED:"false"},now:new Date(NOW)});
    assert.equal(out.enabled,false);assert.equal(mock.calls.length,0);assert.equal(f.read().notion_page_id,null);
  }finally{f.close();mock.restore();}
});
test("admin create/edit/publish/permanent archive stays linked to a single Notion page",async()=>{
  const mock=notionMock(),f=setup(),run=()=>exportFacebookAdminChanges({db:f.db,bindings:settings,now:new Date(NOW)});
  try{
    assert.equal((await run()).created,1);assert.equal(f.read().notion_page_id,PAGE);
    assert.equal(f.read().sync_hash,adminExportAck(1));
    assert.equal(mock.pages.get(PAGE).properties["Stav"].status.name,"Naplánované");
    assert.equal(mock.pages.get(PAGE).properties["Povoliť publikovanie"].checkbox,true);
    assert.equal(mock.pages.get(PAGE).properties["Súhlas majiteľa – priame publikovanie"].checkbox,false);
    assert.equal((await run()).scanned,0);
    f.sql.prepare("UPDATE facebook_image_posts SET title=?,version=version+1,updated_by=? WHERE id=?")
      .run("Zmenené v admine","editor@psipedia.sk",POST);
    assert.equal((await run()).updated,1);
    assert.equal(mock.pages.get(PAGE).properties["Názov"].title[0].text.content,"Zmenené v admine");
    f.sql.prepare("UPDATE facebook_image_posts SET status='published',facebook_post_id=?,published_at=?,version=version+1,updated_by=? WHERE id=?")
      .run("1172082959332114_99887766",NOW,"facebook-image-publisher",POST);
    assert.equal((await run()).updated,1);
    assert.equal(mock.pages.get(PAGE).properties["Stav"].status.name,"Publikované");
    assert.equal(mock.pages.get(PAGE).properties["Facebook URL"].url,"https://www.facebook.com/1172082959332114/posts/99887766");
    f.sql.prepare("UPDATE facebook_image_posts SET deleted_at=?,version=version+1,updated_by=? WHERE id=?")
      .run(NOW,"editor@psipedia.sk",POST);
    assert.equal((await run()).trashed,1);assert.equal(mock.pages.get(PAGE).in_trash,true);
    assert.equal(mock.pages.size,1);
    assert.equal(mock.pages.get(PAGE).in_trash,true);
  }finally{f.close();mock.restore();}
});
test("lost Notion creation response: lookup marker prevents duplicate",async()=>{
  const mock=notionMock(),f=setup(),run=()=>exportFacebookAdminChanges({db:f.db,bindings:settings,now:new Date(NOW)});
  mock.loseNextCreate();
  try{assert.equal((await run()).failed,1);assert.equal(mock.pages.size,1);
    assert.equal(f.read().notion_page_id,null);
    assert.equal((await run()).updated,1);assert.equal(mock.pages.size,1);
    assert.equal(f.read().notion_page_id,PAGE);
    assert.equal(mock.calls.filter(c=>c.path==="/pages"&&c.method==="POST").length,1);
  }finally{f.close();mock.restore();}
});
test("concurrent admin change invalidates in-flight export acknowledgment",async()=>{
  const mock=notionMock(),f=setup(),run=()=>exportFacebookAdminChanges({db:f.db,bindings:settings,now:new Date(NOW)});
  try{await run();
    f.sql.prepare("UPDATE facebook_image_posts SET caption=?,version=version+1,updated_by=? WHERE id=?")
      .run("Starý text","editor@psipedia.sk",POST);
    mock.onNextPatch(()=>f.sql.prepare("UPDATE facebook_image_posts SET caption=?,version=version+1,updated_by=? WHERE id=?")
      .run("Nový text","editor@psipedia.sk",POST));
    assert.equal((await run()).pending,1);
    assert.notEqual(f.read().sync_hash,adminExportAck(3));
    assert.equal((await run()).updated,1);
    assert.equal(mock.pages.get(PAGE).properties["Text na Facebook"].rich_text[0].text.content,"Nový text");
  }finally{f.close();mock.restore();}
});
test("import actor, lease, explicit marker and long captions",()=>{
  const f=setup();
  try{const r=f.read();
    assert.equal(shouldExportAdminImage({...r,updated_by:"notion-facebook-images-sync@psipedia.sk"},Date.parse(NOW)),false);
    assert.equal(adminExportLeaseActive("facebook-admin-export-lock:"+Date.parse(NOW)+":abc",Date.parse(NOW)),true);
    assert.equal(shouldExportAdminImage({...r,sync_hash:"facebook-admin-export-lock:"+Date.parse(NOW)+":abc"},Date.parse(NOW)),false);
    assert.equal(adminExportMarker(POST),"PSIPEDIA_ADMIN_ID:"+POST);
    assert.equal(facebookAdminNotionProperties({...r,caption:"A".repeat(4100)})["Text na Facebook"].rich_text.length,3);
  }finally{f.close();}
});

test("Notion checkbox reflects D1 individual approval, not status or global publisher",()=>{
  const f=setup();
  try {
    const base=f.read();
    const cases=[
      {name:"unapproved draft",status:"draft",approval:"UNREVIEWED",state:"Koncept",allow:false},
      {name:"approved scheduled",status:"scheduled",approval:"APPROVED",state:"Naplánované",allow:true},
      {name:"unapproved scheduled",status:"scheduled",approval:"UNREVIEWED",state:"Naplánované",allow:false},
      {name:"individually approved published",status:"published",approval:"APPROVED",state:"Publikované",allow:true},
      {name:"globally published without individual approval",status:"published",approval:"UNREVIEWED",state:"Publikované",allow:false},
    ];
    for(const item of cases){
      const properties=facebookAdminNotionProperties({...base,status:item.status,approval_status:item.approval});
      assert.equal(properties["Stav"].status.name,item.state,item.name);
      assert.equal(properties["Povoliť publikovanie"].checkbox,item.allow,item.name);
      assert.equal(properties["Dátum a čas publikovania"].date.start,base.scheduled_at,item.name);
    }
    assert.equal(facebookAdminNotionProperties({...base,approval_status:"UNKNOWN"})["Povoliť publikovanie"].checkbox,false);
  }finally{f.close();}
});

test("changing individual approval updates existing Notion page without duplicate or new identity",async()=>{
  const mock=notionMock(),f=setup();
  const run=()=>exportFacebookAdminChanges({db:f.db,bindings:settings,now:new Date(NOW)});
  try {
    assert.equal((await run()).created,1);
    assert.equal(mock.pages.get(PAGE).properties["Povoliť publikovanie"].checkbox,true);
    f.sql.prepare("UPDATE facebook_image_posts SET approval_status='UNREVIEWED',version=version+1,updated_by=? WHERE id=?")
      .run("editor@psipedia.sk",POST);
    assert.equal((await run()).updated,1);
    assert.equal(f.read().notion_page_id,PAGE);
    assert.equal(f.read().sync_hash,adminExportAck(2));
    assert.equal(mock.pages.get(PAGE).properties["Povoliť publikovanie"].checkbox,false);
    assert.equal(mock.pages.get(PAGE).properties["Stav"].status.name,"Naplánované");
    assert.equal(mock.pages.size,1);
    assert.equal(mock.calls.filter(c=>c.path==="/pages"&&c.method==="POST").length,1);
    assert.equal(mock.calls.filter(c=>c.path==="/pages/"+PAGE&&c.method==="PATCH"&&c.body.properties).length,1);
  }finally{f.close();mock.restore();}
});

test("direct owner consent projects to one existing Notion page; revocation synchronizes",async()=>{
  const mock=notionMock(),f=setup(),run=()=>exportFacebookAdminChanges({db:f.db,bindings:settings,now:new Date(NOW)});
  try {
    await run();
    f.sql.prepare("UPDATE facebook_image_posts SET direct_publish_consent=1,direct_consent_by='owner',direct_consent_at=?,version=version+1,updated_by='owner' WHERE id=?").run(NOW,POST);
    assert.equal((await run()).updated,1);
    assert.equal(mock.pages.get(PAGE).properties["Súhlas majiteľa – priame publikovanie"].checkbox,true);
    f.sql.prepare("UPDATE facebook_image_posts SET direct_publish_consent=0,direct_consent_by=NULL,direct_consent_at=NULL,version=version+1,updated_by='owner' WHERE id=?").run(POST);
    assert.equal((await run()).updated,1);
    assert.equal(mock.pages.get(PAGE).properties["Súhlas majiteľa – priame publikovanie"].checkbox,false);
    assert.equal(mock.pages.size,1);
  }finally{f.close();mock.restore();}
});
