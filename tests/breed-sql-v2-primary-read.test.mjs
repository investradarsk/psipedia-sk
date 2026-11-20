import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  breedSqlPrimaryEnabled,breedSqlPrimaryProjection,
  BREED_SQL_V2_READ_EXPRESSIONS,
} from "../lib/breed-sql-v2-primary-read.mjs";
import {
  canonicalBreedIdsSqlV2,canonicalBreedWinnerSqlV2,
  canonicalBreedEligibilitySqlV2,
} from "../lib/breed-canonical.ts";

const foundation=readFileSync(new URL("../drizzle/0174_breeds_sql_json_foundation.sql",import.meta.url),"utf8");
function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`CREATE TABLE managed_breeds(
    id INTEGER PRIMARY KEY,slug TEXT NOT NULL,name TEXT NOT NULL,
    status TEXT NOT NULL,fci_number INTEGER,fci_group INTEGER NOT NULL,
    import_key TEXT,seo_json TEXT NOT NULL,seo_noindex_legacy INTEGER,
    fci_standard_json TEXT NOT NULL,editorial_json TEXT NOT NULL,
    related_breeds_json TEXT NOT NULL
  )`);
  sqlite.exec(foundation);
  sqlite.prepare(`INSERT INTO managed_breeds
    (id,slug,name,status,fci_number,fci_group,import_key,seo_json,
      fci_standard_json,editorial_json,related_breeds_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(1,"labrador-retriever","Labrador","published",122,8,"fci-122",
      JSON.stringify({noindex:true,canonicalUrl:"/bad",title:"STALE"}),
      JSON.stringify({oci:"STALE"}),
      JSON.stringify({overview:"STALE"}),
      "[3]");
  sqlite.prepare(`INSERT INTO managed_breeds
    (id,slug,name,status,fci_number,fci_group,import_key,seo_json,
      fci_standard_json,editorial_json,related_breeds_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(2,"other-breed","Other","draft",123,8,"fci-123",
      "{}", "{}", "{}", "[]");
  sqlite.prepare(`INSERT INTO managed_breeds
    (id,slug,name,status,fci_number,fci_group,import_key,seo_json,
      fci_standard_json,editorial_json,related_breeds_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(3,"related-breed","Related","draft",124,8,"fci-124",
      "{}", "{}", "{}", "[]");
  sqlite.exec(`INSERT INTO breed_fci_standard (breed_id,fci_oci,
    fci_vyska_pes_cm) VALUES(1,'Hnedé','57');
    INSERT INTO breed_editorial_text (breed_id,overview,health_tip,hero_traits_json)
      VALUES(1,'Údaje zo SQL','Preventívna prehliadka','[{"label":"Priateľský","rating":5}]');
    INSERT INTO breed_related_breeds (breed_id,related_breed_id,position)
      VALUES (1,3,0),(1,2,1);
    UPDATE managed_breeds
    SET seo_title='Pravý titulok',seo_og_title='OG titulok',
        seo_canonical_url='/plemena/labrador-retriever',
        seo_noindex=NULL WHERE id=1;`);
  return sqlite;
}
test("SQL mode requires explicit flag; never default to staging table reads",()=>{
  assert.equal(breedSqlPrimaryEnabled({}),false);
  assert.equal(breedSqlPrimaryEnabled({BREED_SQL_V2_READ_MODE:"shadow"}),false);
  assert.equal(breedSqlPrimaryEnabled({BREED_SQL_V2_READ_MODE:"sql"}),true);
});
test("Admin/public detail reads only SQL FCI, editorial, SEO and ordered relation rows",()=>{
  const db=fixture();
  try{
    const select=breedSqlPrimaryProjection(
      "SELECT id,fci_standard_json,editorial_json,seo_json,related_breeds_json FROM managed_breeds WHERE id=?");
    const record=db.prepare(select).get(1);
    assert.equal(JSON.parse(record.fci_standard_json).oci,"Hnedé");
    assert.equal(JSON.parse(record.editorial_json).overview,"Údaje zo SQL");
    assert.equal(JSON.parse(record.editorial_json).healthTip,"Preventívna prehliadka");
    assert.deepEqual(JSON.parse(record.editorial_json).heroTraits,[{label:"Priateľský",rating:5}]);
    assert.equal(JSON.parse(record.seo_json).title,"Pravý titulok");
    assert.equal(JSON.parse(record.seo_json).noindex,false);
    assert.deepEqual(JSON.parse(record.related_breeds_json),[3,2]);
    assert(!select.includes("managed_breeds.fci_standard_json"));
    assert(!select.includes("managed_breeds.editorial_json"));
    assert(!select.includes("managed_breeds.seo_json"));
    assert(!select.includes("managed_breeds.related_breeds_json"));
  }finally{db.close()}
});
test("canonical winner, indexability and sitemap selection follow SQL SEO and not stale JSON",()=>{
  const db=fixture();
  try{
    const ids=db.prepare("SELECT id FROM managed_breeds WHERE id IN ("+
      canonicalBreedIdsSqlV2+")").all().map(x=>x.id);
    assert.deepEqual(ids,[1]);
    const winner=db.prepare("SELECT id FROM managed_breeds WHERE slug=? AND "+
      canonicalBreedWinnerSqlV2("managed_breeds")).get("labrador-retriever");
    assert.equal(winner.id,1);
    assert.equal(canonicalBreedEligibilitySqlV2("b").includes("seo_json"),false);
    db.prepare("UPDATE managed_breeds SET seo_noindex=1 WHERE id=1").run();
    assert.deepEqual(db.prepare("SELECT id FROM managed_breeds WHERE id IN ("+
      canonicalBreedIdsSqlV2+")").all(),[]);
  }finally{db.close()}
});
test("guarded SQL projection rejects accidental legacy predicates and non-read commands",()=>{
  assert.throws(()=>breedSqlPrimaryProjection(
    "SELECT id,seo_json FROM managed_breeds WHERE json_valid(seo_json)"),
    /LEGACY_PREDICATE_FORBIDDEN/);
  assert.throws(()=>breedSqlPrimaryProjection("DELETE FROM managed_breeds"),
    /REQUIRES_MANAGED_SELECT/);
  assert.equal(Object.keys(BREED_SQL_V2_READ_EXPRESSIONS).length,4);
});
