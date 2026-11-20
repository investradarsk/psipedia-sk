import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  DIRECTORY_PRESENTATION_SQL,parseDirectoryPresentationSqlRead,
  directoryServicesSqlExpression,directoryImageSqlExpression,
} from "../lib/directory-presentation-sql-read.ts";

function db(){
  const x=new DatabaseSync(":memory:");
  x.exec("PRAGMA foreign_keys=ON");
  x.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT,status TEXT)");
  const script=readFileSync(new URL("../db/isolated/directory_admin_sql_completion.sql",import.meta.url),"utf8");
  for(const chunk of script.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean))
    x.exec(chunk);
  x.exec(`INSERT INTO directory_profiles VALUES(4,'treneri','published');
   INSERT INTO directory_profile_service_texts VALUES(4,0,'Prvá služba','2026-11-21','owner');
   INSERT INTO directory_profile_service_texts VALUES(4,1,'Druhá služba','2026-11-21','owner');
   INSERT INTO directory_profile_image_display_settings VALUES(4,'thumbnail','crop',50,40,1.4,'2026-11-21','owner');`);
  return x;
}
test("SQL-only reader emits ordered services, typed display and default on missing detail",()=>{
 const x=db();
 try {
  const raw=x.prepare(DIRECTORY_PRESENTATION_SQL).get(4);
  const parsed=parseDirectoryPresentationSqlRead(raw);
  assert.deepEqual(parsed.services,["Prvá služba","Druhá služba"]);
  assert.deepEqual(parsed.thumbnailImageDisplay,{mode:"crop",x:50,y:40,zoom:1.4});
  assert.equal(parsed.detailImageDisplay,null);
  const projection=x.prepare(`SELECT
   ${directoryServicesSqlExpression()} AS services_json,
   ${directoryImageSqlExpression("thumbnail")} AS thumbnail_display_json
   FROM directory_profiles WHERE id=?`).get(4);
  assert.deepEqual(JSON.parse(projection.services_json),parsed.services);
  assert.deepEqual(JSON.parse(projection.thumbnail_display_json),parsed.thumbnailImageDisplay);
 }finally{x.close();}
});
test("explicit empty SQL services win over any stale historical legacy JSON",()=>{
 const x=db();
 try{
  x.exec("DELETE FROM directory_profile_service_texts WHERE profile_id=4");
  const parsed=parseDirectoryPresentationSqlRead(x.prepare(DIRECTORY_PRESENTATION_SQL).get(4));
  assert.deepEqual(parsed.services,[]);
  assert.equal(parsed.detailImageDisplay,null);
 }finally{x.close();}
});
test("unsafe SQL aliases and broken typed display values fail closed",()=>{
 assert.throws(()=>directoryServicesSqlExpression("p;DROP TABLE"),/INVALID_ALIAS/);
 assert.throws(()=>directoryImageSqlExpression("thumbnail","a b"),/INVALID_ALIAS/);
 assert.throws(()=>parseDirectoryPresentationSqlRead({services:"{}",thumbnail:null,detail:null}),/INVALID_SERVICES/);
 assert.throws(()=>parseDirectoryPresentationSqlRead({services:"[]",thumbnail:'{"mode":"crop","x":400,"y":50,"zoom":1}',detail:null}),/INVALID_DISPLAY/);
});
