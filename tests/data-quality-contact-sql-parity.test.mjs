import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  RAW_MISSING_PHONE_SQL, RAW_MISSING_EMAIL_SQL, RAW_MISSING_WEBSITE_SQL,
  missingDirectoryContactSql,
} from "../lib/data-quality-contact-sql.ts";

test("Data Quality reads only SQL columns even when legacy JSON contains different contacts",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE directory_profiles(source_data_json TEXT,website_url TEXT,public_phone TEXT,public_email TEXT)");
    const insert=db.prepare("INSERT INTO directory_profiles VALUES(?,?,?,?)");
    const legacy=JSON.stringify({"Telefón":"old phone","E-mail":"old@example.sk","Web":"https://old.sk"});
    for(const row of [
      [legacy,null,null,null],
      [legacy,"https://new.sk","+421 900 123 456","new@example.sk"],
      [legacy,"","",""],
      [legacy,"\u00a0\u2028","\t\r","\u2029\ufeff"],
    ])insert.run(...row);
    const rows=db.prepare("SELECT "+RAW_MISSING_PHONE_SQL+" missing_phone, "+
      RAW_MISSING_EMAIL_SQL+" missing_email, "+RAW_MISSING_WEBSITE_SQL+
      " missing_website FROM directory_profiles ORDER BY rowid").all();
    assert.deepEqual(rows.map(row=>[row.missing_phone,row.missing_email,row.missing_website]),[
      [1,1,1],[0,0,0],[1,1,1],[1,1,1],
    ]);
  }finally{db.close();}
});

test("SQL-only missing predicates use fixed, allowlisted columns and Unicode whitespace",()=>{
  assert.equal(missingDirectoryContactSql("phone"),RAW_MISSING_PHONE_SQL);
  assert.equal(missingDirectoryContactSql("email"),RAW_MISSING_EMAIL_SQL);
  assert.equal(missingDirectoryContactSql("website"),RAW_MISSING_WEBSITE_SQL);
  assert.match(RAW_MISSING_PHONE_SQL,/public_phone/);
  assert.match(RAW_MISSING_EMAIL_SQL,/public_email/);
  assert.match(RAW_MISSING_WEBSITE_SQL,/website_url/);
  for(const expr of [RAW_MISSING_PHONE_SQL,RAW_MISSING_EMAIL_SQL,RAW_MISSING_WEBSITE_SQL]){
    assert.match(expr,/NULLIF\(trim\(/);
    assert.doesNotMatch(expr,/source_data_json|json_extract|Telefon|Webstránka/);
  }
});

test("Data Quality counts, issue and priority filters use the same SQL predicates",()=>{
  const source=readFileSync(new URL("../lib/data-quality-store.ts",import.meta.url),"utf8");
  assert.match(source,/RAW_MISSING_PHONE_SQL, RAW_MISSING_EMAIL_SQL, RAW_MISSING_WEBSITE_SQL/);
  assert.match(source,/const MISSING_PHONE_SQL = .*RAW_MISSING_PHONE_SQL/);
  assert.match(source,/const MISSING_EMAIL_SQL = .*RAW_MISSING_EMAIL_SQL/);
  assert.match(source,/const MISSING_WEBSITE_SQL = .*RAW_MISSING_WEBSITE_SQL/);
  assert.match(source,/directory_profile_quality_resolutions/);
  assert.match(source,/quality_resolutions_json/);
  assert.doesNotMatch(source,/source_data_json/);
  assert.match(source,/profiles_with_issues/);
  assert.match(source,/const IMPORTANT_PROFILE_ISSUE_SQL/);
});
