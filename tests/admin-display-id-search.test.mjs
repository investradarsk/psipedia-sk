import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {searchAdminRecords} from "../lib/admin-global-search.ts";

function fixture(){
  const sql=new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE directory_profiles(id INTEGER,name TEXT,category TEXT,city TEXT,updated_at TEXT);
    CREATE TABLE managed_breeds(id INTEGER,name TEXT,official_fci_name TEXT,updated_at TEXT);
    CREATE TABLE managed_events(id INTEGER,title TEXT,city TEXT,venue TEXT,start_date TEXT);
    CREATE TABLE managed_eshops(id INTEGER,name TEXT,slug TEXT,website_url TEXT,updated_at TEXT);
    CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER);
    INSERT INTO directory_profiles VALUES (25,'Vet 25','veterinari','Nitra','2026');
    INSERT INTO managed_breeds VALUES (25,'Akita','Akita','2026');
    INSERT INTO managed_events VALUES (25,'Výstava','Nitra','Areál','2026-12-19');
    INSERT INTO managed_eshops VALUES (25,'Shop','shop','https://example.test','2026');
  `);
  let statementCount=0;
  const db={
    prepare(query){
      statementCount++;
      let args=[];
      return {
        bind(...next){args=next;return this;},
        async all(){return {results:sql.prepare(query).all(...args),success:true};},
      };
    },
  };
  return {sql,db,count:()=>statementCount};
}

test("same numeric 25 in four tables is disambiguated with one slash suffix",async()=>{
  const f=fixture();
  try{
    for(const [query,category,href] of [
      ["25/1","Plemená","/admin/plemena/25"],
      ["25/2","Služby pre psov","/admin/adresar/25"],
      ["25/14","Podujatia","/admin/podujatia/25"],
      ["25/26","E-shopy","/admin/recenzie/eshopy/25"],
    ]){
      const before=f.count();
      const result=await searchAdminRecords(f.db,query,true);
      assert.equal(f.count()-before,1,query+" must only query one D1 table");
      assert.equal(result.incomplete,false,query);
      assert.equal(result.results.length,1,query);
      assert.equal(result.results[0].category,category);
      assert.equal(result.results[0].href,href);
      assert.match(result.results[0].subtitle,/ID #25\/[0-9]+/);
    }
  }finally{f.sql.close();}
});

test("category suffix never returns another type, even when plain ID collides",async()=>{
  const f=fixture();
  try{
    assert.equal((await searchAdminRecords(f.db,"25/3")).results.length,0);
    assert.equal((await searchAdminRecords(f.db,"25/999")).results.length,0);
    assert.equal((await searchAdminRecords(f.db,"25/0")).results.length,0);
    assert.equal((await searchAdminRecords(f.db,"25/1")).results[0].href,"/admin/plemena/25");
    assert.equal((await searchAdminRecords(f.db,"25/2")).results[0].href,"/admin/adresar/25");
  }finally{f.sql.close();}
});

test("confirmed deletion tombstone hides scoped results independently by kind",async()=>{
  const f=fixture();
  try{
    f.sql.exec("INSERT INTO admin_record_tombstones VALUES ('directory',25)");
    assert.equal((await searchAdminRecords(f.db,"25/2",true)).results.length,0);
    assert.equal((await searchAdminRecords(f.db,"25/1",true)).results.length,1);
  }finally{f.sql.close();}
});
