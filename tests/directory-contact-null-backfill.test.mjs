import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  DIRECTORY_CONTACT_BACKFILL_FIELDS,
  directoryContactBackfillCountSql,
  directoryContactBackfillUpdateSql,
  directoryContactBackfillSummary,
} from "../lib/directory-contact-null-backfill.mjs";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, status TEXT, source_data_json TEXT," +
    " website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT, updated_at TEXT)");
  db.exec("CREATE TABLE admin_record_tombstones (kind TEXT, record_id INTEGER)");
  function add(id, { category="veterinari", status="published", source={}, ...fields } = {}) {
    db.prepare("INSERT INTO directory_profiles (id,category,status,source_data_json,website_url,public_phone,public_email,facebook_url,instagram_url,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id,category,status,typeof source === "string" ? source : JSON.stringify(source),
        fields.website_url ?? null,fields.public_phone ?? null,fields.public_email ?? null,
        fields.facebook_url ?? null,fields.instagram_url ?? null,"2026-10-01T00:00:00.000Z");
    // Explicit SQL empty clears must not be normalized to NULL.
    for (const column of DIRECTORY_CONTACT_BACKFILL_FIELDS)
      if (Object.hasOwn(fields,column) && fields[column] === "")
        db.prepare("UPDATE directory_profiles SET " + column + "='' WHERE id=?").run(id);
  }
  return {db,add};
}
function apply(db) {
  for (const column of DIRECTORY_CONTACT_BACKFILL_FIELDS)
    db.exec(directoryContactBackfillUpdateSql(column));
}
test("fills only SQL NULL contacts from first nonempty legacy aliases, unchanged on rerun",()=>{
  const {db,add}=fixture();
  try {
    add(1,{source:{"Telefón":"+421 900 000 001","E-mail":"info@example.invalid",
      Web:"https://example.invalid",Facebook:"https://fb.example.invalid",
      Instagram:"@example"}});
    add(2,{source:{Telefón:"",Telefon:"0905123456",Web:"","Webstránka":"www.example.invalid"}});
    const before=directoryContactBackfillSummary(db.prepare(directoryContactBackfillCountSql()).all());
    assert.equal(before.totals.public_phone,2);
    assert.equal(before.totals.website_url,2);
    apply(db);
    const a=db.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
    assert.equal(a.public_phone,"+421 900 000 001");
    assert.equal(a.public_email,"info@example.invalid");
    assert.equal(a.website_url,"https://example.invalid");
    assert.equal(a.facebook_url,"https://fb.example.invalid");
    assert.equal(a.instagram_url,"@example");
    const b=db.prepare("SELECT * FROM directory_profiles WHERE id=2").get();
    assert.equal(b.public_phone,"0905123456");
    assert.equal(b.website_url,"www.example.invalid");
    assert.equal(a.updated_at,"2026-10-01T00:00:00.000Z");
    assert.match(a.source_data_json,/Telefón/);
    apply(db);
    const after=directoryContactBackfillSummary(db.prepare(directoryContactBackfillCountSql()).all());
    assert.deepEqual(after.totals,Object.fromEntries(DIRECTORY_CONTACT_BACKFILL_FIELDS.map(key=>[key,0])));
  } finally { db.close(); }
});
test("never replaces populated SQL, deliberate empty clears, or existing profile metadata",()=>{
  const {db,add}=fixture();
  try {
    add(1,{source:{Telefón:"stale",Facebook:"legacy",Web:"legacy.site"},
      public_phone:"newer SQL",facebook_url:"",website_url:"https://current.example.invalid"});
    apply(db);
    const a=db.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
    assert.equal(a.public_phone,"newer SQL");
    assert.equal(a.facebook_url,"");
    assert.equal(a.website_url,"https://current.example.invalid");
    assert.equal(a.updated_at,"2026-10-01T00:00:00.000Z");
  }finally{db.close();}
});
test("reviewed, archived, deleted-intent, invalid JSON and container aliases are excluded",()=>{
  const {db,add}=fixture();
  try {
    add(1,{source:{Telefón:"reviewed",_psipedia_profile_review_reviewed_at:"2026-11-19"}});
    add(2,{status:"archived",source:{Telefón:"archived"}});
    add(3,{source:{Telefón:"tombstone"}});
    add(4,{source:"{invalid"});
    add(5,{source:{Telefón:["private","number"]}});
    add(6,{source:{Telefón:{"number":"bad"}}});
    db.prepare("INSERT INTO admin_record_tombstones (kind,record_id) VALUES ('directory',3)").run();
    const before=directoryContactBackfillSummary(db.prepare(directoryContactBackfillCountSql()).all());
    assert.equal(before.totals.public_phone,0);
    apply(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles WHERE public_phone IS NOT NULL").get().n,0);
  }finally{db.close();}
});
test("aggregated report contains only integer counts, no raw contact values",()=>{
  const {db,add}=fixture();
  try{
    add(1,{source:{"Telefón":"PRIVATE-456","E-mail":"private@example.invalid"}});
    add(2,{category:"treneri",source:{"Instagram":"private_account"}});
    const report=directoryContactBackfillSummary(db.prepare(directoryContactBackfillCountSql()).all());
    assert.equal(report.profiles,2);
    assert.equal(report.byCategory.veterinari.candidates.public_phone,1);
    assert.equal(report.byCategory.treneri.candidates.instagram_url,1);
    assert.doesNotMatch(JSON.stringify(report),/PRIVATE-456|private@example|private_account/);
    assert.throws(()=>directoryContactBackfillSummary([{category:"veterinari",profiles:2}]),/INVALID_REPORT/);
  }finally{db.close();}
});
test("backfill stays constrained to five known nullable SQL fields",()=>{
  for(const field of DIRECTORY_CONTACT_BACKFILL_FIELDS) {
    const sql=directoryContactBackfillUpdateSql(field);
    assert.match(sql,/^UPDATE directory_profiles SET /);
    assert.match(sql,new RegExp(field + " IS NULL"));
    assert.match(sql,/NOT EXISTS \(SELECT 1 FROM admin_record_tombstones/);
    assert.match(sql,/review_reviewed_at/);
    assert.doesNotMatch(sql,/\bDELETE\b|\bDROP\b|\bALTER\b|\bINSERT\b/i);
  }
  assert.throws(()=>directoryContactBackfillUpdateSql("name"),/UNKNOWN_COLUMN/);
  const source=readFileSync(new URL("../lib/directory-contact-null-backfill.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/Notion API|fetch\(/);
});
