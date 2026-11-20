import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {planDirectory0173EditorialSqlMirror} from "../lib/directory-0173-editorial-sql-mirror.ts";
import {isDirectoryEventPilotCategory,isDirectoryFieldEventCategory} from "../lib/notion-directory-field-event-scope.ts";

const source=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
const start=source.indexOf("const breederScalarColumns:");
const end=source.indexOf("/**\n * Mapped breeder/trainer event mode:",start);
assert(start>0 && end>start);
const code=ts.transpileModule(source.slice(start,end)+
  "\nexports.saveBreederEditorialValue=saveBreederEditorialValue;",{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function setup(category="veterinari"){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec([
    "CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT,status TEXT,updated_at TEXT,updated_by TEXT,seo_json TEXT,qualifications_json TEXT,search_text TEXT)",
    "CREATE TABLE directory_profile_seo(profile_id INTEGER PRIMARY KEY,title TEXT DEFAULT '',description TEXT DEFAULT '',focus_keyword TEXT DEFAULT '',canonical_url TEXT DEFAULT '',og_title TEXT DEFAULT '',og_description TEXT DEFAULT '',og_image_url TEXT DEFAULT '',noindex INTEGER DEFAULT 0,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)",
    "CREATE TABLE directory_profile_qualifications(profile_id INTEGER,item_order INTEGER,qualification_text TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(profile_id,item_order))",
  ].join(";")+";");
  const current={id:84,category,status:"published",updatedAt:"2026-11-20T01:00:00Z",
    seo:{title:"Old SEO",description:"Keep description",focusKeyword:"dogs",canonicalUrl:"",
      ogTitle:"Keep OG",ogDescription:"",ogImage:"",noindex:true},
    qualifications:["Old"]};
  sqlite.prepare("INSERT INTO directory_profiles(id,category,status,updated_at,updated_by,seo_json,qualifications_json,search_text) VALUES(?,?,?,?,?,?,?,?)")
    .run(84,category,"published",current.updatedAt,"admin",JSON.stringify(current.seo),'["Old"]',"");
  sqlite.prepare("INSERT INTO directory_profile_seo(profile_id,title,description,focus_keyword,canonical_url,og_title,og_description,og_image_url,noindex,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(84,"Old SEO","Keep description","dogs","","Keep OG","","",1,current.updatedAt,"admin");
  sqlite.prepare("INSERT INTO directory_profile_qualifications VALUES(?,?,?,?,?)")
    .run(84,0,"Old",current.updatedAt,"admin");
  const db={
    prepare(sql){
      function statement(args=[]){
        return {sql,args,bind(...values){return statement(values)},
          async first(){return sqlite.prepare(sql).get(...args)??null}};
      }
      return statement();
    },
    async batch(statements){
      sqlite.exec("BEGIN");
      try{
        const rows=statements.map(({sql,args=[]})=>({results:sqlite.prepare(sql).all(...args),success:true}));
        sqlite.exec("COMMIT");
        return rows;
      }catch(error){sqlite.exec("ROLLBACK");throw error}
    },
  };
  const exports={};
  runInNewContext(code,{exports,SYSTEM_ACTOR:"notion-field-event",directoryFilterRegistry:[],
    TRAINER_SERVICES_TEXT_METADATA_KEY:"_psipedia_trainer_services_text",
    DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS:[],
    isDirectoryEventPilotCategory,isDirectoryFieldEventCategory,
    breederReadPath:(data,path)=>path.split(".").reduce((v,k)=>v?.[k],data),
    normalizeDirectorySearchText:v=>v,planDirectory0173EditorialSqlMirror,
    getManagedDirectoryProfileById:async()=>current});
  const desired=()=>({name:"Test",excerpt:"",description:"",services:[],
    qualifications:[],region:"",district:"",city:"",address:"",postalCode:"",
    street:"",houseNumber:"",seo:{...current.seo}});
  return {sqlite,db,current,desired,save:exports.saveBreederEditorialValue};
}

test("Notion SEO title atomically updates sidecar while preserving other SQL SEO",async()=>{
  const h=setup();
  try{
    const next=h.desired();next.seo.title="Notion fresh title";
    await h.save(h.db,h.current,next,"seo.title");
    const s=h.sqlite.prepare("SELECT title,description,og_title,noindex FROM directory_profile_seo WHERE profile_id=84").get();
    assert.deepEqual({...s},{title:"Notion fresh title",description:"Keep description",og_title:"Keep OG",noindex:1});
    assert.equal(JSON.parse(h.sqlite.prepare("SELECT seo_json FROM directory_profiles WHERE id=84").get().seo_json).title,"Notion fresh title");
  }finally{h.sqlite.close()}
});

test("Notion noindex=false updates SQL without changing other SEO",async()=>{
  const h=setup("chovatelske-stanice");
  try{
    const next=h.desired();next.seo.noindex=false;
    await h.save(h.db,h.current,next,"seo.noindex");
    const s=h.sqlite.prepare("SELECT title,noindex FROM directory_profile_seo WHERE profile_id=84").get();
    assert.deepEqual({...s},{title:"Old SEO",noindex:0});
  }finally{h.sqlite.close()}
});

test("Notion qualifications update and explicit clear preserve SQL/JSON parity",async()=>{
  for(const values of [["First","Second"],[]]){
    const h=setup("hotely-a-opatrovanie");
    try{
      const next=h.desired();next.qualifications=values;
      await h.save(h.db,h.current,next,"qualifications");
      assert.deepEqual(h.sqlite.prepare("SELECT qualification_text FROM directory_profile_qualifications WHERE profile_id=84 ORDER BY item_order")
        .all().map(x=>x.qualification_text),values);
      assert.deepEqual(JSON.parse(h.sqlite.prepare("SELECT qualifications_json FROM directory_profiles WHERE id=84").get().qualifications_json),values);
      assert.equal(h.sqlite.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=84").get().title,"Old SEO");
    }finally{h.sqlite.close()}
  }
});

test("stale Notion update rolls back both canonical JSON and SQL sidecar",async()=>{
  const h=setup();
  try{
    h.sqlite.prepare("UPDATE directory_profiles SET updated_at='newer-admin-change' WHERE id=84").run();
    const next=h.desired();next.seo.title="Stale";
    await assert.rejects(()=>h.save(h.db,h.current,next,"seo.title"));
    assert.equal(h.sqlite.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=84").get().title,"Old SEO");
    assert.equal(JSON.parse(h.sqlite.prepare("SELECT seo_json FROM directory_profiles WHERE id=84").get().seo_json).title,"Old SEO");
  }finally{h.sqlite.close()}
});
