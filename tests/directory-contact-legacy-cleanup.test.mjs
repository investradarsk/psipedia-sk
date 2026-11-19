import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  DIRECTORY_CONTACT_CLEANUP_FIELDS,
  directoryContactCleanupCountSql,
  directoryContactCleanupUpdateSql,
  directoryContactCleanupSummary,
} from "../lib/directory-contact-legacy-cleanup.mjs";
import { overlayDirectorySqlContacts } from "../lib/directory-sql-contacts.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE directory_profiles (" +
    "id INTEGER PRIMARY KEY,category TEXT,status TEXT,source_data_json TEXT," +
    "website_url TEXT,public_phone TEXT,public_email TEXT,facebook_url TEXT,instagram_url TEXT," +
    "updated_at TEXT,updated_by TEXT,name TEXT)");
  db.exec("CREATE TABLE admin_record_tombstones (kind TEXT,record_id INTEGER,state TEXT)");
  function add(id, source={}, columns={}, status="published", category="veterinari") {
    db.prepare("INSERT INTO directory_profiles " +
      "(id,category,status,source_data_json,website_url,public_phone,public_email," +
      "facebook_url,instagram_url,updated_at,updated_by,name) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,category,status,typeof source==="string"?source:JSON.stringify(source),
      columns.website_url??null,columns.public_phone??null,columns.public_email??null,
      columns.facebook_url??null,columns.instagram_url??null,
      "2026-10-01T00:00:00Z","owner","Profile "+id);
  }
  function apply() {
    for (const field of DIRECTORY_CONTACT_CLEANUP_FIELDS)
      db.exec(directoryContactCleanupUpdateSql(field));
  }
  function report() {
    return directoryContactCleanupSummary(db.prepare(directoryContactCleanupCountSql()).all());
  }
  function get(id) {
    return db.prepare("SELECT * FROM directory_profiles WHERE id=?").get(id);
  }
  return {db,add,apply,report,get};
}
test("removes only legacy contact aliases that have a canonical SQL owner",()=>{
  const f=fixture();
  try {
    const source={
      Web:"old.example", "Webstránka":"old-2.example",
      "Telefón":"old-phone",Telefon:"old-phone2",phone:"old-phone3",
      "E-mail":"old-email",Email:"old-email2",email:"old-email3",
      Facebook:"old-facebook",Instagram:"old-instagram",
      "Pokrytie":"Celé Slovensko","Ordinačné hodiny":"Po–Pi",
      _psipedia_additional_categories:'["treneri"]',
      _psipedia_breeder_gallery:'[{"key":"photo.jpg"}]',
      "Typ služby":"Hotel",other:{"nested":["still here"]},
    };
    f.add(1,source,{
      website_url:"https://current.example",public_phone:"+421 900 111 111",
      public_email:"correct@example.invalid",facebook_url:"",instagram_url:"@correct",
    });
    const before=f.report();
    for(const field of DIRECTORY_CONTACT_CLEANUP_FIELDS)
      assert.equal(before.removable[field],1);
    f.apply();
    const row=f.get(1);
    const next=JSON.parse(row.source_data_json);
    for(const name of ["Web","Webstránka","Telefón","Telefon","phone",
      "E-mail","Email","email","Facebook","Instagram"])
      assert.equal(Object.hasOwn(next,name),false,name);
    for(const key of ["Pokrytie","Ordinačné hodiny","_psipedia_additional_categories",
      "_psipedia_breeder_gallery","Typ služby","other"])
      assert.deepEqual(next[key],source[key],key);
    assert.equal(row.website_url,"https://current.example");
    assert.equal(row.public_phone,"+421 900 111 111");
    assert.equal(row.public_email,"correct@example.invalid");
    assert.equal(row.facebook_url,"");
    assert.equal(row.instagram_url,"@correct");
    assert.equal(row.updated_at,"2026-10-01T00:00:00Z");
    assert.equal(row.updated_by,"owner");
    const after=f.report();
    for(const field of DIRECTORY_CONTACT_CLEANUP_FIELDS)
      assert.equal(after.removable[field],0);
    const jsonBeforeRerun=row.source_data_json;
    f.apply();
    assert.equal(f.get(1).source_data_json,jsonBeforeRerun);
  } finally {f.db.close();}
});
test("NULL SQL retains all aliases, explicit SQL empty string removes only its own aliases",()=>{
  const f=fixture();
  try {
    f.add(1,{"Telefón":"legacy-phone","E-mail":"email@old","Instagram":"instagram@old"},
      {public_phone:"",public_email:null,instagram_url:null});
    assert.equal(f.report().removable.public_phone,1);
    assert.equal(f.report().unmigrated.public_email,1);
    assert.equal(f.report().unmigrated.instagram_url,1);
    f.apply();
    const source=JSON.parse(f.get(1).source_data_json);
    assert(!Object.hasOwn(source,"Telefón"));
    assert.equal(source["E-mail"],"email@old");
    assert.equal(source.Instagram,"instagram@old");
    assert.equal(f.get(1).public_phone,"");
  }finally{f.db.close();}
});
test("reviewed, pending unlock, archived and tombstoned profiles remain untouched",()=>{
  const f=fixture();
  try {
    f.add(1,{Facebook:"reviewed",_psipedia_profile_review_reviewed_at:"2026-11-18"},{
      facebook_url:"new"}, "published");
    f.add(2,{Facebook:"unlock",_psipedia_profile_review_unlock_pending:"1"},{
      facebook_url:"new"}, "published");
    f.add(3,{Facebook:"archived"},{facebook_url:"new"},"archived");
    f.add(4,{Facebook:"tombstone"},{facebook_url:"new"},"draft");
    f.db.exec("INSERT INTO admin_record_tombstones VALUES ('directory',4,'PENDING_NOTION')");
    const old=[1,2,3,4].map(id=>f.get(id).source_data_json);
    const report=f.report();
    assert.equal(report.removable.facebook_url,0);
    assert.equal(report.protected.facebook_url,4);
    f.apply();
    assert.deepEqual([1,2,3,4].map(id=>f.get(id).source_data_json),old);
  } finally {f.db.close();}
});
test("invalid JSON, arrays and unchanged SQL NULL are never erased",()=>{
  const f=fixture();
  try {
    f.add(1,"{broken",{public_email:"now"});
    f.add(2,'["Facebook","hi"]',{public_email:"now"});
    f.add(3,{Facebook:"legacy"}, {facebook_url:null});
    f.add(4,{other:{name:"nested",Facebook:"nested should stay"}},
      {facebook_url:"current"});
    const before=[1,2,3,4].map(id=>f.get(id).source_data_json);
    f.apply();
    assert.deepEqual([1,2,3,4].map(id=>f.get(id).source_data_json),before);
    assert.equal(f.report().unmigrated.facebook_url,1);
  }finally{f.db.close();}
});
test("public read model remains SQL-first and matches before/after cleanup",()=>{
  const f=fixture();
  try {
    f.add(1,{Facebook:"old","Telefón":"old-phone",Instagram:"only-json"},{
      facebook_url:"new",public_phone:"+421 900 555 555",instagram_url:null});
    const before=f.get(1);
    const publicBefore=readDirectoryPublicContacts(
      overlayDirectorySqlContacts(JSON.parse(before.source_data_json),before),
      before.website_url??"");
    f.apply();
    const after=f.get(1);
    const publicAfter=readDirectoryPublicContacts(
      overlayDirectorySqlContacts(JSON.parse(after.source_data_json),after),
      after.website_url??"");
    assert.deepEqual(publicAfter,publicBefore);
    assert.equal(publicAfter.facebook,"new");
    assert.equal(publicAfter.phone,"+421 900 555 555");
    assert.equal(publicAfter.instagram,"only-json");
  }finally{f.db.close();}
});
test("only aggregate counts are returned, grouped by primary category without PII",()=>{
  const f=fixture();
  try{
    f.add(1,{"E-mail":"private@example.invalid"},{public_email:"current"}, "published","veterinari");
    f.add(2,{Facebook:"https://private.invalid"},{facebook_url:"new"}, "published","treneri");
    const summary=f.report();
    assert.equal(summary.profiles,2);
    assert.equal(summary.byCategory.veterinari.removable.public_email,1);
    assert.equal(summary.byCategory.treneri.removable.facebook_url,1);
    assert(!JSON.stringify(summary).includes("private"));
    assert.throws(()=>directoryContactCleanupSummary([{category:"veterinari",profiles:1}]),/INVALID_REPORT/);
  }finally{f.db.close();}
});
test("every operation is guarded, SQL-only, idempotent, and cannot drop other JSON keys",()=>{
  const content=readFileSync(new URL("../lib/directory-contact-legacy-cleanup.mjs",import.meta.url),"utf8");
  assert(!/fetch\s*\(/.test(content));
  for(const field of DIRECTORY_CONTACT_CLEANUP_FIELDS) {
    const sql=directoryContactCleanupUpdateSql(field);
    assert.match(sql,/^UPDATE directory_profiles SET source_data_json = json_remove\(/);
    assert.match(sql,new RegExp(field+" IS NOT NULL"));
    assert.match(sql,/admin_record_tombstones/);
    assert.match(sql,/profile_review_reviewed_at/);
    assert.match(sql,/profile_review_unlock_pending/);
    assert.doesNotMatch(sql,/\b(?:DROP|INSERT|ALTER|REPLACE|DELETE)\b/i);
    assert.doesNotMatch(sql,/\bupdated_at\s*=/i);
    assert.doesNotMatch(sql,/\bupdated_by\s*=/i);
  }
  assert.throws(()=>directoryContactCleanupUpdateSql("description"),/UNKNOWN_FIELD/);
});
