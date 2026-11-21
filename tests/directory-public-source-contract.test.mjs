import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  DIRECTORY_PUBLIC_SOURCE_FACETS,
  directoryEffectiveDistrictSql,
  directoryEffectiveDistrictValue,
  directoryLegacyDistrictSql,
} from "../lib/directory-public-source-contract.ts";

function fixture() {
 const db=new DatabaseSync(":memory:");
 db.exec(`
   CREATE TABLE directory_profiles (
     id INTEGER PRIMARY KEY,status TEXT,category TEXT,district TEXT,source_data_json TEXT
   );
   CREATE TABLE directory_profile_public_facts (
     profile_id INTEGER,field_key TEXT,value_text TEXT,PRIMARY KEY(profile_id,field_key)
   );
   CREATE TABLE directory_profile_extra_fields (
     profile_id INTEGER,field_key TEXT,text_value TEXT,PRIMARY KEY(profile_id,field_key)
   );
 `);
 const add=db.prepare("INSERT INTO directory_profiles VALUES(?,?,?,?,?)");
 add.run(1,"published","kynologicke-kluby","Nitra",'{"Organizácia":"Stará hodnota","Okres":"Levice"}');
 add.run(2,"published","kynologicke-kluby","",'{"Okres":"Nitra","Plemená":"Pôvodný text"}');
 add.run(3,"published","kynologicke-kluby","","{}");
 add.run(4,"published","kynologicke-kluby","   ","{broken");
 add.run(5,"published","kynologicke-kluby","   ",'{"Organizácia":"Neaktuálna"}');
 const fact=db.prepare("INSERT INTO directory_profile_public_facts VALUES(?,?,?)");
 for(const [id,key,value] of [
   [1,"Plemeno","Labrador"],[1,"FCI skupina","8"],
   [1,"Organizácia","Nový klub"],[1,"Typ služby","Klub"],
   [2,"Plemeno","Zlatý retriever"],[2,"FCI skupina","8"],
   [2,"Organizácia","Len SQL"],[2,"Typ služby","Kynologický klub"],
 ])fact.run(id,key,value);
 return db;
}
test("source facets use current relational SQL, never historical aliases",()=>{
 const db=fixture();
 try {
  const fields=DIRECTORY_PUBLIC_SOURCE_FACETS;
  const rows=db.prepare(`SELECT id,${directoryEffectiveDistrictSql()} AS district,
    ${fields.breed} AS breed,
    ${fields.fciGroup} AS fciGroup,
    ${fields.organization} AS organization,
    ${fields.profileType} AS profileType
    FROM directory_profiles ORDER BY id`).all();
  assert.deepEqual(
    [rows[0].district,rows[0].breed,rows[0].fciGroup,rows[0].organization,rows[0].profileType],
    ["Nitra","Labrador","8","Nový klub","Klub"],
  );
  assert.deepEqual(
    [rows[1].district,rows[1].breed,rows[1].fciGroup,rows[1].organization,rows[1].profileType],
    ["","Zlatý retriever","8","Len SQL","Kynologický klub"],
  );
  for(const row of rows.slice(2))assert.deepEqual(
    [row.breed,row.fciGroup,row.organization,row.profileType],["","","",""]);
 }finally{db.close();}
});
test("only canonical D1 district is used; empty values never resurrect JSON",()=>{
 const db=fixture();
 try {
  const sql=directoryEffectiveDistrictSql();
  assert.deepEqual(db.prepare(`SELECT id FROM directory_profiles WHERE ${sql}=? ORDER BY id`).all("Nitra").map(x=>x.id),[1]);
  assert.deepEqual(db.prepare(`SELECT id FROM directory_profiles WHERE ${sql}=? ORDER BY id`).all("").map(x=>x.id),[2,3,4,5]);
  const rows=db.prepare(`SELECT ${directoryLegacyDistrictSql("profile")} AS old
      FROM directory_profiles profile ORDER BY id`).all();
  assert.deepEqual(rows.map(x=>x.old),[null,null,null,null,null]);
  assert.equal(directoryEffectiveDistrictValue(" Nitra ","Levice"),"Nitra");
  assert.equal(directoryEffectiveDistrictValue(""," Nitra "),"");
 }finally{db.close();}
});
test("public SQL contracts do not query source_data_json for source facets or districts",()=>{
 const source=readFileSync(new URL("../lib/directory-public-source-contract.ts",import.meta.url),"utf8");
 const store=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 const facets=readFileSync(new URL("../lib/directory-read-facets.ts",import.meta.url),"utf8");
 const homepage=readFileSync(new URL("../lib/homepage-directory-query.ts",import.meta.url),"utf8");
 assert.doesNotMatch(source,/source_data_json|json_extract/);
 assert.match(store,/directoryEffectiveDistrictSql\(\)/);
 assert.match(facets,/directoryEffectiveDistrictSql\(\)/);
 assert.match(homepage,/directoryLegacyDistrictSql\("profile"\)/);
});
