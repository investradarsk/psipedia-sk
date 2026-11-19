import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {DIRECTORY_FIELD_EVENT_CATEGORIES,isDirectoryFieldEventCategory,isDirectoryEventPilotCategory}
 from "../lib/notion-directory-field-event-scope.ts";

const directory=await readFile(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
const start=directory.indexOf("const breederScalarColumns:");
const end=directory.indexOf("/**\n * Mapped breeder/trainer event mode:",start);
assert.ok(start>0&&end>start,"per-field saved-source extraction must remain available");
const js=ts.transpileModule(directory.slice(start,end)+
 "\nexports.saveBreederEditorialValue = saveBreederEditorialValue;",{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function setup(category){
 const writes=[];
 const record={id:1826,category,status:"draft",updatedAt:"2026-11-12T12:00:00.000Z"};
 const db={prepare(sql){return {bind(...args){
   writes.push({sql,args});
   return {async first(){return {id:1826}}};
 }}}};
 const out={};
 runInNewContext(js,{
   exports:out,SYSTEM_ACTOR:"directory-sync-contract-test",
   directoryFilterRegistry:[],
   TRAINER_SERVICES_TEXT_METADATA_KEY:"_psipedia_trainer_services_text",
   isDirectoryFieldEventCategory,isDirectoryEventPilotCategory,
   breederReadPath:(snapshot,path)=>path.split(".").reduce((v,key)=>v?.[key],snapshot),
   normalizeDirectorySearchText:value=>value,
   getManagedDirectoryProfileById:async()=>record,
 });
 return {record,writes,db,save:out.saveBreederEditorialValue};
}
function desired(){
 return {
   name:"Testovací profil",description:"x",excerpt:"",services:[],qualifications:[],
   city:"",region:"",district:"",address:"",postalCode:"",street:"",houseNumber:"",
   seo:{title:"Test SEO"},
   publicPhone:"0912345678",
 };
}
test("all ten Directory categories save Popis, SEO and contacts independently with CAS",async()=>{
 assert.equal(DIRECTORY_FIELD_EVENT_CATEGORIES.length,10);
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   const next=desired();
   await ctx.save(ctx.db,ctx.record,next,"description");
   await ctx.save(ctx.db,ctx.record,next,"seo.title");
   await ctx.save(ctx.db,ctx.record,next,"publicPhone");
   assert.equal(ctx.writes.length,3,category);
   assert.match(ctx.writes[0].sql,/description = \?/);
   assert.equal(ctx.writes[0].args[0],"x");
   assert.match(ctx.writes[1].sql,/seo_json = json_set/);
   assert.equal(ctx.writes[1].args[1],"Test SEO");
   assert.match(ctx.writes[2].sql,/source_data_json = json_remove/);
   assert.match(ctx.writes[2].sql,/public_phone = \?/);
   assert.equal(ctx.writes[2].args[0],"0912345678");
   for(const write of ctx.writes){
     assert.match(write.sql,/updated_at = \?/);
     assert.match(write.sql,/status <> 'archived'/);
     assert.doesNotMatch(write.sql,/services_json\s*=/);
     assert.doesNotMatch(write.sql,/DELETE FROM/);
   }
 }
});
test("explicit blank Popis saves as empty string in every Directory category",async()=>{
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   await ctx.save(ctx.db,ctx.record,{...desired(),description:""},"description");
   assert.equal(ctx.writes[0].args[0],"",category);
   assert.doesNotMatch(ctx.writes[0].sql,/services_json\s*=|seo_json\s*=/);
 }
});
test("legacy free-text service writes never reach V3 and pilot categories reject them",async()=>{
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   const request={...desired(),services:["Individuálny výcvik"]};
   if(isDirectoryEventPilotCategory(category)){
     await assert.rejects(()=>ctx.save(ctx.db,ctx.record,request,"services"),
      /DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/,category);
     assert.equal(ctx.writes.length,0,category);
   }else{
     await ctx.save(ctx.db,ctx.record,request,"services");
     assert.equal(ctx.writes.length,1,category);
     assert.doesNotMatch(ctx.writes[0].sql,/directory_service_notion_relation_sync|service_profile_option_choices/);
     if(category==="treneri"){
       assert.match(ctx.writes[0].sql,/source_data_json = json_set/);
       assert.equal(ctx.writes[0].args[1],"Individuálny výcvik");
       assert.doesNotMatch(ctx.writes[0].sql,/services_json\s*=/);
     }else{
       assert.match(ctx.writes[0].sql,/services_json = \?/);
     }
   }
 }
});


test("explicit Notion contact edit stores SQL only and removes edited-field JSON aliases", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const cases = [
    {
      field: "websiteUrl", value: "https://new.example.sk",
      aliases: ["Web", "Webstránka"],
    },
    {
      field: "publicPhone", value: "0911 555 123",
      aliases: ["Telefón", "Telefon", "phone"],
    },
    {
      field: "publicEmail", value: "novy@example.sk",
      aliases: ["E-mail", "Email", "email"],
    },
    {
      field: "facebookUrl", value: "https://facebook.com/new",
      aliases: ["Facebook"],
    },
    {
      field: "instagramUrl", value: "@novyprofil",
      aliases: ["Instagram"],
    },
  ];
  for (const change of cases) {
    const ctx = setup("veterinari");
    await ctx.save(ctx.db, ctx.record, { ...desired(), [change.field]: change.value }, change.field);
    assert.equal(ctx.writes.length, 1, change.field);
    const { sql, args } = ctx.writes[0];
    assert.match(sql, /source_data_json = json_remove\(/, change.field);
    assert.doesNotMatch(sql, /source_data_json = json_set\(/, change.field);
    assert.match(sql, /AND updated_at = \?/, change.field);
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`CREATE TABLE directory_profiles (
        id INTEGER PRIMARY KEY, category TEXT, status TEXT, updated_at TEXT,
        updated_by TEXT, website_url TEXT,
        public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT,
        source_data_json TEXT
      )`);
      const before = {
        "Web": "https://old.example.sk",
        "Webstránka": "https://hidden-old.example.sk",
        "Telefón": "0900 111 111",
        "Telefon": "0900 222 222",
        phone: "0900 333 333",
        "E-mail": "old@example.sk", Email: "hidden@example.sk",
        email: "third@example.sk", Facebook: "old-facebook", Instagram: "old-instagram",
        "Organizácia": "Zachovať údaj",
        "_psipedia_breeder_gallery_urls": ["https://image.example.sk/photo.jpg"],
      };
      sqlite.prepare(`INSERT INTO directory_profiles
        (id,category,status,updated_at,website_url,source_data_json)
        VALUES (?,?,?,?,?,?)`).run(
        ctx.record.id, ctx.record.category, ctx.record.status,
        ctx.record.updatedAt, "https://old.example.sk", JSON.stringify(before),
      );
      const updated = sqlite.prepare(sql).get(...args);
      assert.equal(updated.id, ctx.record.id, change.field);
      const row = sqlite.prepare("SELECT source_data_json,website_url FROM directory_profiles WHERE id=?")
        .get(ctx.record.id);
      const after = JSON.parse(row.source_data_json);
      // Value lives in SQL; no parallel edited-field copy survives in JSON.
      for (const alias of change.aliases) {
        assert.equal(Object.hasOwn(after, alias), false, change.field + ": " + alias);
      }
      if (change.field === "websiteUrl") assert.equal(row.website_url, change.value);
      else assert.equal(row.website_url, "https://old.example.sk");
      const sqlColumn = ({
        publicPhone:"public_phone", publicEmail:"public_email",
        facebookUrl:"facebook_url", instagramUrl:"instagram_url",
      })[change.field];
      if (sqlColumn) {
        const stored = sqlite.prepare("SELECT " + sqlColumn + " AS value FROM directory_profiles WHERE id=?")
          .get(ctx.record.id);
        assert.equal(stored.value,change.value,change.field + " must also update SQL");
      }
      assert.equal(after.Organizácia, before.Organizácia, change.field);
      assert.deepEqual(after._psipedia_breeder_gallery_urls, before._psipedia_breeder_gallery_urls);
      for (const key of ["Web", "Telefón", "E-mail", "Facebook", "Instagram"]) {
        if (!change.aliases.includes(key)) assert.equal(after[key], before[key], change.field + ": " + key);
      }
    } finally {
      sqlite.close();
    }
  }
});

test("explicit Notion contact deletion cannot resurrect a historical alias", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const ctx = setup("veterinari");
  await ctx.save(ctx.db, ctx.record, { ...desired(), websiteUrl: "" }, "websiteUrl");
  const { sql, args } = ctx.writes[0];
  assert.match(sql, /source_data_json = json_remove\(/);
  assert.doesNotMatch(sql, /source_data_json = json_set\(/);
  assert.equal(args[0], "", "website_url is explicitly cleared");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT, status TEXT, updated_at TEXT,
      updated_by TEXT, website_url TEXT,
        public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT,
        source_data_json TEXT
    )`);
    sqlite.prepare(`INSERT INTO directory_profiles
      (id,category,status,updated_at,website_url,source_data_json) VALUES (?,?,?,?,?,?)`)
      .run(ctx.record.id, ctx.record.category, ctx.record.status, ctx.record.updatedAt,
        "https://old.example.sk", JSON.stringify({
          Web: "https://old.example.sk", "Webstránka": "https://ghost.example.sk",
          Telefón: "0900 555 555", _psipedia_some_future_metadata: "preserve",
        }));
    const updated = sqlite.prepare(sql).get(...args);
    assert.equal(updated.id, ctx.record.id);
    const row = sqlite.prepare("SELECT website_url,source_data_json FROM directory_profiles WHERE id=?")
      .get(ctx.record.id);
    const after = JSON.parse(row.source_data_json);
    assert.equal(row.website_url, "");
    assert.equal(Object.hasOwn(after, "Web"), false);
    assert.equal(Object.hasOwn(after, "Webstránka"), false);
    assert.equal(after.Telefón, "0900 555 555");
    assert.equal(after._psipedia_some_future_metadata, "preserve");
  } finally {
    sqlite.close();
  }
});
