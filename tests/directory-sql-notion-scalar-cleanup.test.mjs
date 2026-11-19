import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {
  DIRECTORY_SQL_NOTION_SCALAR_COLUMNS,
  DIRECTORY_SQL_NOTION_SCALAR_LABELS,
  directoryScalarCleanupCountSql,
  directoryScalarCleanupUpdateSql,
  directoryScalarCleanupSummary,
} from "../lib/directory-sql-notion-scalar-cleanup.mjs";

function fixture() {
  const db=new DatabaseSync(":memory:");
  const cols=DIRECTORY_SQL_NOTION_SCALAR_COLUMNS;
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
    assert.match(sql,new RegExp(c+" IS NOT NULL"));
    assert.match(sql,new RegExp("TRIM\\(CAST\\("+c+" AS TEXT\\)\\) <> ''"));
    assert.match(sql,/admin_record_tombstones/);
    assert.match(sql,/profile_review_reviewed_at/);
    assert.match(sql,/profile_review_unlock_pending/);
    assert.doesNotMatch(sql,/\b(?:DROP|ALTER|DELETE|REPLACE|INSERT)\b/i);
    assert.doesNotMatch(sql,/\bupdated_at\s*=/i);
    assert.doesNotMatch(sql,/\bupdated_by\s*=/i);
  }
  assert.throws(()=>directoryScalarCleanupUpdateSql("services_json"),/UNKNOWN_COLUMN/);
});
test("removes SQL-owned scalar JSON duplicates but preserves every SQL value and unrelated public/technical metadata",()=>{
  const f=fixture();
  try {
    const src=Object.fromEntries(DIRECTORY_SQL_NOTION_SCALAR_COLUMNS.map(c=>
      [DIRECTORY_SQL_NOTION_SCALAR_LABELS[c],"old-"+c]));
    Object.assign(src,{
      "Ordinačné hodiny":"Po-Pi", "Pokrytie":"Celé Slovensko",
      "Služby":"legacy services", "Kvalifikácie":"cert",
      _psipedia_additional_categories:'["treneri"]',
      _psipedia_quality_phone_status:"NOT_FOUND",
      _psipedia_breeder_gallery:'["image"]',
      "Iný atribút":{nested:["intact"]},
    });
    const sql=Object.fromEntries(DIRECTORY_SQL_NOTION_SCALAR_COLUMNS.map(c=>[c,"SQL "+c]));
    f.add(1,src,sql);
    const before=f.counts();
    assert.equal(before.profiles,1);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS)
      assert.equal(before.totals.removable[c],1);
    f.apply();
    const row=f.get(1),after=JSON.parse(row.source_data_json);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS){
      assert(!Object.hasOwn(after,DIRECTORY_SQL_NOTION_SCALAR_LABELS[c]));
      assert.equal(row[c],"SQL "+c);
    }
    for (const key of ["Ordinačné hodiny","Pokrytie","Služby",
      "Kvalifikácie","_psipedia_additional_categories",
      "_psipedia_quality_phone_status","_psipedia_breeder_gallery","Iný atribút"])
      assert.deepEqual(after[key],src[key]);
    assert.equal(row.updated_at,"2026-11-18T12:00:00Z");
    assert.equal(row.updated_by,"test-owner");
    const json=row.source_data_json;
    f.apply();
    assert.equal(f.get(1).source_data_json,json);
    for(const c of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS)
      assert.equal(f.counts().totals.removable[c],0);
  }finally{f.db.close();}
});
test("does not erase an ambiguous empty SQL field, even when legacy JSON is nonempty",()=>{
  const f=fixture();
  try{
    f.add(1,{
      Názov:"Historical name",Perex:"Historical perex",Popis:"Historical popis",
      Okres:"Nitra",Adresa:"Some address",
    },{
      name:"SQL canonical name",excerpt:"",description:null,district:"",address:"New SQL address",
    });
    const before=f.counts();
    assert.equal(before.totals.unconfirmed.excerpt,1);
    assert.equal(before.totals.unconfirmed.description,1);
    assert.equal(before.totals.unconfirmed.district,1);
    assert.equal(before.totals.removable.name,1);
    assert.equal(before.totals.removable.address,1);
    f.apply();
    const source=JSON.parse(f.get(1).source_data_json);
    assert.equal(source.Perex,"Historical perex");
    assert.equal(source.Popis,"Historical popis");
    assert.equal(source.Okres,"Nitra");
    assert(!Object.hasOwn(source,"Názov"));
    assert(!Object.hasOwn(source,"Adresa"));
  }finally{f.db.close();}
});
test("archive, owner-reviewed, pending-unlock and tombstone profiles remain untouched",()=>{
  const f=fixture();
  try{
    for(let id=1;id<=4;id++){
      const src={Perex:"legacy"};
      if(id===1)src._psipedia_profile_review_reviewed_at="2026-11-19T09:00:00Z";
      if(id===2)src._psipedia_profile_review_unlock_pending="1";
      f.add(id,src,{excerpt:"sql"},id===3?"archived":"published");
    }
    f.db.exec("INSERT INTO admin_record_tombstones VALUES ('directory',4)");
    assert.equal(f.counts().totals.protected.excerpt,4);
    const before=[1,2,3,4].map(id=>f.get(id).source_data_json);
    f.apply();
    assert.deepEqual([1,2,3,4].map(id=>f.get(id).source_data_json),before);
  }finally{f.db.close();}
});
test("malformed JSON and arrays never get replaced or silently emptied",()=>{
  const f=fixture();
  try{
    f.add(1,"{not-json",{excerpt:"correct"});
    f.add(2,'["Perex"]',{excerpt:"correct"});
    f.add(3,{Perex:"legacy"},{excerpt:null});
    const old=[1,2,3].map(id=>f.get(id).source_data_json);
    f.apply();
    assert.deepEqual([1,2,3].map(id=>f.get(id).source_data_json),old);
  }finally{f.db.close();}
});
test("audit output is grouped counts only and contains no names, descriptions or addresses",()=>{
  const f=fixture();
  try {
    f.add(1,{Popis:"Sensitive description"},{description:"Current description"});
    f.add(2,{Adresa:"Specific private address"},{address:"SQL address"},
      "published","treneri");
    const result=f.counts();
    assert.equal(result.profiles,2);
    assert.equal(result.byCategory.veterinari.removable.description,1);
    assert.equal(result.byCategory.treneri.removable.address,1);
    assert(!JSON.stringify(result).includes("Sensitive"));
    assert(!JSON.stringify(result).includes("Specific private"));
    assert.throws(()=>directoryScalarCleanupSummary([{category:"veterinari",profiles:1}]),
      /INVALID_REPORT/);
  }finally{f.db.close();}
});
