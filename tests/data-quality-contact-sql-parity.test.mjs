import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  RAW_MISSING_PHONE_SQL,
  RAW_MISSING_EMAIL_SQL,
  RAW_MISSING_WEBSITE_SQL,
  missingDirectoryContactSql,
} from "../lib/data-quality-contact-sql.ts";
import {readDirectoryPublicContacts} from "../lib/directory-profile-metadata.ts";

/** Match Data Quality's read-only profile SQL with canonical JS contact aliases. */
const cases=[
  {name:"all unavailable",contacts:null,website:""},
  {name:"invalid legacy JSON",contacts:"{invalid json",website:""},
  {name:"empty canonical phone / populated Telefon",contacts:{"Telefón":" ","Telefon":"+421 900 555 001"},website:""},
  {name:"blank first phone / fallback phone",contacts:{"Telefón":"","Telefon":"  ","phone":"+421 900 555 002"},website:""},
  {name:"empty canonical email / fallback Email",contacts:{"E-mail":" ","Email":"someone@example.sk"},website:""},
  {name:"empty e-mail aliases / fallback email",contacts:{"E-mail":"","Email":"  ","email":"someone@example.sk"},website:""},
  {name:"empty canonical website / Webstranka present",contacts:{"Web":" ","Webstránka":"https://firma.sk"},website:""},
  {name:"empty all Notion websites / website_url present",contacts:{"Web":"","Webstránka":"  "},website:"https://web.sk"},
  {name:"invalid JSON still uses website_url",contacts:"{invalid json",website:"https://web.sk"},
  {name:"canonical values take precedence",contacts:{"Telefón":"+421 999 111 111","Telefon":"+421 900 222 222","E-mail":"first@example.sk","Email":"second@example.sk","Web":"https://first.sk","Webstránka":"https://second.sk"},website:"https://third.sk"},
  {name:"all whitespace",contacts:{"Telefón":" ","Telefon":"  ","phone":" ","E-mail":" ","Email":" ","email":" ","Web":" ","Webstránka":" "},website:" "},
  {name:"tabs and line breaks are empty",contacts:{"Telefón":"\t\n\r","E-mail":"\v\f","Web":"\r\n"},website:"\t"},
  {name:"Unicode whitespace is empty",contacts:{"Telefón":"\u00a0\u2028","E-mail":"\u2029\ufeff","Web":"\u2000\u3000"},website:"\u202f\u205f"},
  {name:"whitespace aliases preserve later values",contacts:{"Telefón":"\t\n","phone":"123","E-mail":"\u00a0","email":"contact@example.sk","Web":"\ufeff"},website:"https://web.sk"},
  {name:"zero is an existing numeric contact",contacts:{"Telefón":0},website:""},
  {name:"null aliases fall through",contacts:{"Telefón":null,"phone":"123","E-mail":null,"email":"contact@example.sk","Web":null},website:"https://web.sk"},
  {name:"numeric phone historically accepted by public reader",contacts:{"Telefón":123456789},website:""},
  {name:"unrelated fields",contacts:{"Facebook":"https://facebook.com/example","Instagram":"https://instagram.com/example"},website:""},
];

test("blank aliases do not shadow later contact aliases or website_url",()=>{
  const sqlite=new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE directory_profiles (source_data_json TEXT, website_url TEXT)");
    const insert=sqlite.prepare("INSERT INTO directory_profiles (source_data_json,website_url) VALUES (?,?)");
    const read=sqlite.prepare(
      "SELECT " +
      RAW_MISSING_PHONE_SQL+" AS missing_phone, " +
      RAW_MISSING_EMAIL_SQL+" AS missing_email, " +
      RAW_MISSING_WEBSITE_SQL+" AS missing_website " +
      "FROM directory_profiles ORDER BY rowid ASC"
    );
    for(const c of cases){
      insert.run(
        typeof c.contacts==="string"?c.contacts:JSON.stringify(c.contacts),
        c.website
      );
    }
    const rows=read.all();
    assert.equal(rows.length,cases.length);
    cases.forEach((c,index)=>{
      const parsed=typeof c.contacts==="string"?null:c.contacts;
      const expected=readDirectoryPublicContacts(parsed,c.website);
      assert.equal(rows[index].missing_phone,expected.phone?0:1,c.name+": phone");
      assert.equal(rows[index].missing_email,expected.email?0:1,c.name+": email");
      assert.equal(rows[index].missing_website,expected.website?0:1,c.name+": website");
    });
  }finally{sqlite.close();}
});

test("contact SQL expressions are fixed allowlisted fragments and preserve public precedence",()=>{
  assert.equal(missingDirectoryContactSql("phone"),RAW_MISSING_PHONE_SQL);
  assert.equal(missingDirectoryContactSql("email"),RAW_MISSING_EMAIL_SQL);
  assert.equal(missingDirectoryContactSql("website"),RAW_MISSING_WEBSITE_SQL);
  assert.match(RAW_MISSING_PHONE_SQL,/Telefón/);
  assert.match(RAW_MISSING_EMAIL_SQL,/E-mail/);
  assert.match(RAW_MISSING_WEBSITE_SQL,/website_url/);
  for(const expr of [RAW_MISSING_PHONE_SQL,RAW_MISSING_EMAIL_SQL,RAW_MISSING_WEBSITE_SQL]){
    assert.match(expr,/NULLIF\(trim\(/);
    assert.doesNotMatch(expr,/\$\{.*\}/);
  }
});

test("Data Quality count, issue, priority filters use identical contact SQL expressions",()=>{
  const source=readFileSync(new URL("../lib/data-quality-store.ts",import.meta.url),"utf8");
  assert.match(source,/import \{ RAW_MISSING_PHONE_SQL, RAW_MISSING_EMAIL_SQL, RAW_MISSING_WEBSITE_SQL \} from "@\/lib\/data-quality-contact-sql"/);
  assert.match(source,/const MISSING_PHONE_SQL = .*RAW_MISSING_PHONE_SQL/);
  assert.match(source,/const MISSING_EMAIL_SQL = .*RAW_MISSING_EMAIL_SQL/);
  assert.match(source,/const MISSING_WEBSITE_SQL = .*RAW_MISSING_WEBSITE_SQL/);
  assert.match(source,/missing_phone/);
  assert.match(source,/profiles_with_issues/);
  assert.match(source,/const IMPORTANT_PROFILE_ISSUE_SQL/);
});
