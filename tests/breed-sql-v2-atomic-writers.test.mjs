import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {
  breedSqlV2ShadowEnabled,breedSqlV2FullSnapshotStatements,breedSqlV2NewBreedStatements,
  breedSqlV2DirectFieldStatements,breedSqlV2ControlledStatements,
  breedSqlV2CasGuard,
} from "../lib/breed-sql-v2-writer.mjs";
import {breedEventD1FieldPatch} from "../lib/notion-breed-workcopy-field-sql.mjs";

const migration=readFileSync(new URL("../drizzle/0174_breeds_sql_json_foundation.sql",import.meta.url),"utf8");
const current="2026-11-19T18:00:00.000Z";
const newer="2026-11-19T18:00:01.000Z";

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`CREATE TABLE managed_breeds(
    id INTEGER PRIMARY KEY,slug TEXT UNIQUE,updated_at TEXT NOT NULL,
    fci_group INTEGER NOT NULL DEFAULT 8,fci_section_number TEXT NOT NULL DEFAULT '1',
    size TEXT NOT NULL DEFAULT 'Stredné',
    fci_standard_json TEXT NOT NULL DEFAULT '{}',
    editorial_json TEXT NOT NULL DEFAULT '{}',
    seo_json TEXT NOT NULL DEFAULT '{}',
    related_breeds_json TEXT NOT NULL DEFAULT '[]'
  )`);
  sqlite.exec(migration);
  sqlite.exec(`CREATE TABLE breed_notion_controlled_values(
    breed_id INTEGER PRIMARY KEY, values_json TEXT, notion_values_json TEXT,
    revision INTEGER,updated_at TEXT)`);
  const insert=sqlite.prepare("INSERT INTO managed_breeds (id,slug,updated_at) VALUES (?,?,?)");
  for(let id=1;id<=4;id++)insert.run(id,"breed-"+id,current);
  sqlite.exec(`INSERT INTO breed_fci_standard (breed_id) VALUES (1);
    INSERT INTO breed_editorial_text (breed_id) VALUES (1);
    INSERT INTO breed_public_facts (breed_id) VALUES (1);`);
  const db={
    prepare(sql){
      return {sql,bind(...values){return {sql,values}}};
    },
    async batch(statements){
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const result=statements.map(({sql,values=[]})=>{
          const statement=sqlite.prepare(sql);
          if(/\bRETURNING\b/i.test(sql)||/^\s*SELECT\b/i.test(sql)){
            return {results:statement.all(...values)};
          }
          return {results:[],meta:statement.run(...values)};
        });
        sqlite.exec("COMMIT");return result;
      }catch(error){sqlite.exec("ROLLBACK");throw error}
    },
  };
  return {sqlite,db};
}

test("shadow writes are opt-in; there is no accidental production cutover",()=>{
  assert.equal(breedSqlV2ShadowEnabled({}),false);
  assert.equal(breedSqlV2ShadowEnabled({BREED_SQL_V2_WRITE_MODE:"compare"}),false);
  assert.equal(breedSqlV2ShadowEnabled({BREED_SQL_V2_WRITE_MODE:"shadow"}),true);
});

test("dirty Notion and Admin JSON field updates mirror one SQL cell transactionally",async()=>{
  const {sqlite,db}=fixture();
  try{
    const patch=breedEventD1FieldPatch("editorial.overview","Nový prehľad");
    const sql="UPDATE managed_breeds SET "+patch.assignments.join(",")+
      ",updated_at=? WHERE id=? AND updated_at=? RETURNING id";
    await db.batch([
      db.prepare(sql).bind(...patch.params,newer,1,current),
      breedSqlV2CasGuard(db),
      ...breedSqlV2DirectFieldStatements(db,1,"editorial.overview","Nový prehľad"),
    ]);
    assert.equal(sqlite.prepare("SELECT json_extract(editorial_json,'$.overview') AS v FROM managed_breeds WHERE id=1").get().v,"Nový prehľad");
    assert.equal(sqlite.prepare("SELECT overview FROM breed_editorial_text WHERE breed_id=1").get().overview,"Nový prehľad");
    await assert.rejects(db.batch([
      db.prepare(sql).bind(...patch.params,"2026-11-19T18:00:02.000Z",1,current),
      breedSqlV2CasGuard(db),
      ...breedSqlV2DirectFieldStatements(db,1,"editorial.overview","ZASTARANÝ"),
    ]),/malformed JSON/);
    assert.equal(sqlite.prepare("SELECT overview FROM breed_editorial_text WHERE breed_id=1").get().overview,"Nový prehľad");
  }finally{sqlite.close()}
});

test("a missing SQL mirror aborts the entire legacy update",async()=>{
  const {sqlite,db}=fixture();
  try{
    const patch=breedEventD1FieldPatch("fciStandard.oci","Hnedé");
    const sql="UPDATE managed_breeds SET "+patch.assignments.join(",")+
      ",updated_at=? WHERE id=? AND updated_at=? RETURNING id";
    await assert.rejects(db.batch([
      db.prepare(sql).bind(...patch.params,newer,2,current),
      breedSqlV2CasGuard(db),
      ...breedSqlV2DirectFieldStatements(db,2,"fciStandard.oci","Hnedé"),
    ]),/malformed JSON/);
    assert.equal(sqlite.prepare("SELECT fci_standard_json FROM managed_breeds WHERE id=2").get().fci_standard_json,"{}");
    assert.equal(sqlite.prepare("SELECT updated_at FROM managed_breeds WHERE id=2").get().updated_at,current);
  }finally{sqlite.close()}
});

test("full Admin save atomically updates 33 FCI, 11 editorial, SEO, ordered relations",async()=>{
  const {sqlite,db}=fixture();
  try{
    const value={
      fciStandard:{oci:"Hnedé",fci_standard_pdf:"https://fci.be/standard"},
      editorial:{overview:"Úplný opis",healthTip:"Preventívne prehliadky",
        heroTraits:[{label:"Pokoj",rating:5}]},
      seo:{title:"Labrador",ogImage:"/media/dog.webp",noindex:false},
      relatedBreedIds:[3,2],
    };
    const update=db.prepare("UPDATE managed_breeds SET fci_standard_json=?,editorial_json=?,seo_json=?,related_breeds_json=?,updated_at=? WHERE id=? AND updated_at=? RETURNING id")
      .bind(JSON.stringify(value.fciStandard),JSON.stringify(value.editorial),
        JSON.stringify(value.seo),JSON.stringify(value.relatedBreedIds),newer,1,current);
    await db.batch([update,breedSqlV2CasGuard(db),
      ...breedSqlV2FullSnapshotStatements(db,1,value)]);
    assert.equal(sqlite.prepare("SELECT fci_oci FROM breed_fci_standard WHERE breed_id=1").get().fci_oci,"Hnedé");
    const e=sqlite.prepare("SELECT overview,health_tip,hero_traits_json FROM breed_editorial_text WHERE breed_id=1").get();
    assert.equal(e.overview,"Úplný opis");
    assert.equal(e.health_tip,"Preventívne prehliadky");
    assert.equal(JSON.parse(e.hero_traits_json)[0].rating,5);
    const seo=sqlite.prepare("SELECT seo_title,seo_og_image,seo_noindex FROM managed_breeds WHERE id=1").get();
    assert.deepEqual({...seo},{seo_title:"Labrador",seo_og_image:"/media/dog.webp",seo_noindex:0});
    const edges=sqlite.prepare("SELECT related_breed_id FROM breed_related_breeds WHERE breed_id=1 ORDER BY position").all().map(x=>x.related_breed_id);
    assert.deepEqual(edges,[3,2]);
  }finally{sqlite.close()}
});

test("controlled CAS updates only changed numbers/selections and keeps other facts",async()=>{
  const {sqlite,db}=fixture();
  try{
    const values={heightMinCm:52.5,heightMaxCm:62,originCountries:["Slovensko"],
      fciGroupSelect:"9",fciSectionSelect:"2",sizeSelect:"Veľké"};
    sqlite.prepare("INSERT INTO breed_notion_controlled_values VALUES (?,?,?,?,?)")
      .run(1,"{}","{}",0,current);
    await db.batch([
      db.prepare("UPDATE breed_notion_controlled_values SET values_json=?,revision=revision+1 WHERE breed_id=? AND revision=?")
        .bind(JSON.stringify(values),1,0),
      breedSqlV2CasGuard(db),
      db.prepare("UPDATE managed_breeds SET updated_at=? WHERE id=? AND updated_at=?")
        .bind(newer,1,current),
      breedSqlV2CasGuard(db),
      ...breedSqlV2ControlledStatements(db,1,values),
    ]);
    const row=sqlite.prepare("SELECT height_min_cm,height_max_cm,origin_countries_json FROM breed_public_facts WHERE breed_id=1").get();
    assert.equal(row.height_min_cm,52.5);assert.equal(row.height_max_cm,62);
    assert.deepEqual(JSON.parse(row.origin_countries_json),["Slovensko"]);
    const scalar=sqlite.prepare("SELECT fci_group,fci_section_number,size FROM managed_breeds WHERE id=1").get();
    assert.deepEqual({...scalar},{fci_group:9,fci_section_number:"2",size:"Veľké"});
    // Unchanged historical classification is kept if Notion select is null.
    const nulls=breedSqlV2ControlledStatements(db,1,{fciGroupSelect:null,fciSectionSelect:null,sizeSelect:null});
    assert.equal(nulls.length,0);
    await assert.rejects(db.batch([
      db.prepare("UPDATE breed_notion_controlled_values SET revision=revision+1 WHERE breed_id=1 AND revision=0"),
      breedSqlV2CasGuard(db),
      ...breedSqlV2ControlledStatements(db,1,{heightMinCm:11}),
    ]),/malformed JSON/);
    assert.equal(sqlite.prepare("SELECT height_min_cm FROM breed_public_facts WHERE breed_id=1").get().height_min_cm,52.5);
  }finally{sqlite.close()}
});


test("new-breed creation commits legacy row, FCI, editorial, SEO and related breeds in one transaction",async()=>{
  const {sqlite,db}=fixture();
  try{
    const value={fciStandard:{oci:"Modré"},editorial:{overview:"Nové plemeno"},
      seo:{title:"Nové",noindex:true},relatedBreedIds:[1,2]};
    const statements=[
      db.prepare("INSERT INTO managed_breeds (slug,updated_at,fci_standard_json,editorial_json,seo_json,related_breeds_json) VALUES (?,?,?,?,?,?)")
        .bind("new-breed",newer,JSON.stringify(value.fciStandard),
          JSON.stringify(value.editorial),JSON.stringify(value.seo),
          JSON.stringify(value.relatedBreedIds)),
      ...breedSqlV2NewBreedStatements(db,"new-breed",value),
    ];
    await db.batch(statements);
    const newBreed=sqlite.prepare("SELECT id,seo_title,seo_noindex FROM managed_breeds WHERE slug='new-breed'").get();
    assert.ok(newBreed.id>4);
    assert.equal(newBreed.seo_title,"Nové");
    assert.equal(newBreed.seo_noindex,1);
    assert.equal(sqlite.prepare("SELECT fci_oci FROM breed_fci_standard WHERE breed_id=?").get(newBreed.id).fci_oci,"Modré");
    assert.equal(sqlite.prepare("SELECT overview FROM breed_editorial_text WHERE breed_id=?").get(newBreed.id).overview,"Nové plemeno");
    assert.deepEqual(sqlite.prepare("SELECT related_breed_id FROM breed_related_breeds WHERE breed_id=? ORDER BY position")
      .all(newBreed.id).map(x=>x.related_breed_id),[1,2]);
    const invalid=[db.prepare("INSERT INTO managed_breeds (slug,updated_at) VALUES (?,?)")
        .bind("bad-breed",newer),
      ...breedSqlV2NewBreedStatements(db,"bad-breed",{relatedBreedIds:[9999]})];
    await assert.rejects(db.batch(invalid),/FOREIGN KEY/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM managed_breeds WHERE slug='bad-breed'").get().n,0);
  }finally{sqlite.close()}
});
