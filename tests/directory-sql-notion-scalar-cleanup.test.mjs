import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {
  omitDirectorySqlContactAliases,
  omitDirectorySqlNotionScalarAliases,
  DIRECTORY_SQL_NOTION_SCALAR_JSON_KEYS,
} from "../lib/directory-profile-metadata.ts";
import {
  DIRECTORY_SQL_NOTION_SCALAR_COLUMNS,
  DIRECTORY_SQL_NOTION_SCALAR_LABELS,
  DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS,
  DIRECTORY_SQL_NOTION_CONTACT_ALIASES,
  directoryScalarCleanupCountSql,
  directoryScalarCleanupUpdateSql,
  directoryScalarCleanupSummary,
} from "../lib/directory-sql-notion-scalar-cleanup.mjs";

function fixture() {
  const db=new DatabaseSync(":memory:");
  const cols=DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS;
  db.exec("CREATE TABLE directory_profiles (" +
    "id INTEGER PRIMARY KEY,category TEXT,status TEXT,source_data_json TEXT,"+
    cols.map(k=>k+" TEXT").join(",")+",updated_at TEXT,updated_by TEXT)");
  db.exec("CREATE TABLE admin_record_tombstones (kind TEXT,record_id INTEGER)");
  const add=(id,source={},sql={},status="published",category="veterinari")=>{
    const names=["id","category","status","source_data_json",
      ...cols,"updated_at","updated_by"];
    const values=[id,category,status,
      typeof source==="string"?source:JSON.stringify(source),
      ...cols.map(k=>Object.hasOwn(sql,k)?sql[k]:null),
      "2026-11-18T12:00:00Z","test-owner"];
    db.prepare("INSERT INTO directory_profiles ("+names.join(",")+") VALUES ("+
      names.map(()=>"?").join(",")+")").run(...values);
  };
  const get=id=>db.prepare("SELECT * FROM directory_profiles WHERE id=?").get(id);
  const counts=()=>directoryScalarCleanupSummary(
    db.prepare(directoryScalarCleanupCountSql()).all());
  const apply=()=>{for(const c of cols)db.exec(directoryScalarCleanupUpdateSql(c));};
  return {db,add,get,counts,apply};
}
test("12 approved Notion/SQL columns have one exact historic JSON label each",()=>{
  const cols=DIRECTORY_SQL_NOTION_SCALAR_COLUMNS;
  assert.equal(cols.length,12);
  assert.equal(DIRECTORY_SQL_NOTION_SCALAR_LABELS.name,"Názov");
  assert.equal(DIRECTORY_SQL_NOTION_SCALAR_LABELS.excerpt,"Perex");
  assert.equal(DIRECTORY_SQL_NOTION_SCALAR_LABELS.description,"Popis");
  assert.equal(DIRECTORY_SQL_NOTION_SCALAR_LABELS.district,"Okres");
  assert.equal(DIRECTORY_SQL_NOTION_SCALAR_LABELS.address_format,"Formát adresy");
  for (const c of cols) {
    const sql=directoryScalarCleanupUpdateSql(c);
    assert.match(sql,/^UPDATE directory_profiles SET source_data_json = json_remove\(/);
    assert.match(sql,/^UPDATE directory_profiles SET source_data_json/);
    assert.doesNotMatch(sql,/TRIM\(CAST\(.* IS NOT NULL/);
    assert.doesNotMatch(sql,/\b(?:DROP|ALTER|DELETE|REPLACE|INSERT)\b/i);
    assert.doesNotMatch(sql,/\bupdated_at\s*=/i);
    assert.doesNotMatch(sql,/\bupdated_by\s*=/i);
  }
  assert.throws(()=>directoryScalarCleanupUpdateSql("services_json"),/UNKNOWN_COLUMN/);
});
test("removes all 12 historic scalar JSON keys, even when SQL values are empty or NULL",()=>{
  const f=fixture();
  try {
    const src=Object.fromEntries(DIRECTORY_SQL_NOTION_SCALAR_COLUMNS.map(c=>
      [DIRECTORY_SQL_NOTION_SCALAR_LABELS[c],"legacy-"+c]));
    Object.assign(src,{
      "Ordinačné hodiny":"Po-Pi", "Pokrytie":"Celé Slovensko",
      "Služby":"legacy services", "Kvalifikácie":"cert",
      _psipedia_additional_categories:'["treneri"]',
      _psipedia_quality_phone_status:"NOT_FOUND",
      _psipedia_breeder_gallery:'["image"]',
      "Iný atribút":{nested:["intact"]},
    });
    const sql={name:"SQL canonical",excerpt:"",description:null,district:"",address:"SQL street"};
    f.add(1,src,sql);
    const before=f.counts();
    assert.equal(before.profiles,1);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS)
      assert.equal(before.totals.removable[c],1);
    assert.equal(before.totals.withoutSqlValue.description,1);
    assert.equal(before.totals.withoutSqlValue.excerpt,1);
    assert.equal(before.totals.withoutSqlValue.district,1);
    f.apply();
    const row=f.get(1),after=JSON.parse(row.source_data_json);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS)
      assert(!Object.hasOwn(after,DIRECTORY_SQL_NOTION_SCALAR_LABELS[c]));
    assert.equal(row.name,"SQL canonical");
    assert.equal(row.excerpt,"");
    assert.equal(row.description,null);
    assert.equal(row.district,"");
    assert.equal(row.address,"SQL street");
    for (const key of ["Ordinačné hodiny","Pokrytie","Služby",
      "Kvalifikácie","_psipedia_additional_categories",
      "_psipedia_quality_phone_status","_psipedia_breeder_gallery","Iný atribút"])
      assert.deepEqual(after[key],src[key]);
    assert.equal(row.updated_at,"2026-11-18T12:00:00Z");
    assert.equal(row.updated_by,"test-owner");
    const json=row.source_data_json;
    f.apply();
    assert.equal(f.get(1).source_data_json,json);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS) {
      assert.equal(f.counts().totals.removable[c],0);
      assert.equal(f.counts().totals.withoutSqlValue[c],0);
    }
  }finally{f.db.close();}
});
test("removes all remaining JSON-only contact backups, with no SQL value needed",()=>{
  const f=fixture();
  try{
    const src={
      Web:"old website", "Webstránka":"older website",
      "Telefón":"old phone",Telefon:"old2",phone:"old3",
      "E-mail":"email",Email:"old email",email:"old email 2",
      Facebook:"facebook",Instagram:"instagram",
      Perex:"old excerpt",
      "Ordinačné hodiny":"Mon-Fri",
      _psipedia_additional_categories:'["treneri"]',
    };
    f.add(1,src,{website_url:"",public_phone:null,
      public_email:null,facebook_url:"",instagram_url:null,excerpt:""});
    const before=f.counts();
    for(const field of Object.keys(DIRECTORY_SQL_NOTION_CONTACT_ALIASES)) {
      assert.equal(before.totals.removable[field],1);
      assert.equal(before.totals.withoutSqlValue[field],1);
    }
    f.apply();
    const row=f.get(1);
    const kept=JSON.parse(row.source_data_json);
    for(const key of ["Web","Webstránka","Telefón","Telefon","phone",
      "E-mail","Email","email","Facebook","Instagram","Perex"])
      assert(!Object.hasOwn(kept,key),key);
    assert.equal(kept["Ordinačné hodiny"],"Mon-Fri");
    assert.equal(kept._psipedia_additional_categories,'["treneri"]');
    assert.equal(row.website_url,"");
    assert.equal(row.public_phone,null);
    for(const field of Object.keys(DIRECTORY_SQL_NOTION_CONTACT_ALIASES))
      assert.equal(f.counts().totals.removable[field],0);
  }finally{f.db.close();}
});
test("reviewed, archived, pending-unlock and tombstone profiles have historic copies removed",()=>{
  const f=fixture();
  try{
    for(let id=1;id<=4;id++){
      const src={Perex:"legacy",Názov:"legacy name"};
      if(id===1)src._psipedia_profile_review_reviewed_at="2026-11-19T09:00:00Z";
      if(id===2)src._psipedia_profile_review_unlock_pending="1";
      f.add(id,src,{name:"sql"},id===3?"archived":"published");
    }
    f.db.exec("INSERT INTO admin_record_tombstones VALUES ('directory',4)");
    assert.equal(f.counts().totals.removable.excerpt,4);
    f.apply();
    for(let id=1;id<=4;id++) {
      const source=JSON.parse(f.get(id).source_data_json);
      assert(!Object.hasOwn(source,"Perex"));
      assert(!Object.hasOwn(source,"Názov"));
      if(id===1)assert.equal(source._psipedia_profile_review_reviewed_at,"2026-11-19T09:00:00Z");
      if(id===2)assert.equal(source._psipedia_profile_review_unlock_pending,"1");
    }
  }finally{f.db.close();}
});
test("invalid JSON and arrays remain intact and do not cause silent replacement",()=>{
  const f=fixture();
  try{
    f.add(1,"{not-json",{excerpt:"correct"});
    f.add(2,'["Perex"]',{excerpt:"correct"});
    f.add(3,{Perex:"legacy"},{excerpt:null});
    const old=[1,2].map(id=>f.get(id).source_data_json);
    const summary=f.counts();
    assert.equal(summary.totals.invalidJson,1);
    assert.equal(summary.totals.removable.excerpt,1);
    f.apply();
    assert.deepEqual([1,2].map(id=>f.get(id).source_data_json),old);
    assert.equal(JSON.parse(f.get(3).source_data_json).Perex,undefined);
  }finally{f.db.close();}
});
test("aggregate report counts only, no names, descriptions or addresses",()=>{
  const f=fixture();
  try {
    f.add(1,{Popis:"Sensitive description"},{description:""});
    f.add(2,{Adresa:"Specific private address"},{address:null},
      "published","treneri");
    const result=f.counts();
    assert.equal(result.profiles,2);
    assert.equal(result.byCategory.veterinari.removable.description,1);
    assert.equal(result.byCategory.treneri.removable.address,1);
    assert.equal(result.totals.withoutSqlValue.description,1);
    assert(!JSON.stringify(result).includes("Sensitive"));
    assert(!JSON.stringify(result).includes("Specific private"));
    assert.throws(()=>directoryScalarCleanupSummary([{category:"veterinari",profiles:1}]),
      /INVALID_REPORT/);
  }finally{f.db.close();}
});

test("normal Admin SQL writes strip the 12 old scalar and 5 contact alias groups",()=>{
  const old=Object.fromEntries(
    DIRECTORY_SQL_NOTION_SCALAR_COLUMNS.map(c=>
      [DIRECTORY_SQL_NOTION_SCALAR_LABELS[c],"old"]
    )
  );
  const source={...old, "Telefón":"old number",Facebook:"old facebook",
    "Služby":"active", _psipedia_profile_review_reviewed_at:"today"};
  assert.deepEqual([...DIRECTORY_SQL_NOTION_SCALAR_JSON_KEYS].sort(),
    Object.values(DIRECTORY_SQL_NOTION_SCALAR_LABELS).sort());
  const direct=omitDirectorySqlNotionScalarAliases(source);
  const saved=omitDirectorySqlContactAliases(source,{publicPhone:"+421 555"});
  for(const result of [direct,saved]){
    for(const key of DIRECTORY_SQL_NOTION_SCALAR_JSON_KEYS)
      assert(!Object.hasOwn(result,key));
    assert.equal(result["Služby"],"active");
    if(result===saved){assert(!Object.hasOwn(result,"Telefón"));
      assert(!Object.hasOwn(result,"Facebook"));}
    assert.equal(result._psipedia_profile_review_reviewed_at,"today");
  }
  assert.equal(source["Popis"],"old");
});
