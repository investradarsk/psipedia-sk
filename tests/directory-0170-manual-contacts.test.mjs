import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { overlayDirectorySqlContacts } from "../lib/directory-sql-contacts.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";

test("legacy contacts stay readable while SQL 0170 is NULL", () => {
  const result = overlayDirectorySqlContacts({
    Telefon: "0900 111 111", Email:"legacy@example.sk", Facebook:"legacy-facebook",
    "Organizácia":"Zachovať", "_psipedia_additional_categories":"[]",
  }, {public_phone:null, public_email:null, facebook_url:null, instagram_url:null});
  assert.equal(readDirectoryPublicContacts(result).phone, "0900 111 111");
  assert.equal(result["Organizácia"], "Zachovať");
});
test("each SQL contact wins independently, including arbitrary raw text", () => {
  const legacy = { "Telefón":"old", Telefon:"older", phone:"oldest", Email:"legacy",
    Instagram:"old-instagram", "Zameranie":"zachovať"};
  const result = overlayDirectorySqlContacts(legacy,{
    public_phone:"nový text 123 bez validácie", instagram_url:"@mojprofil",
  });
  assert.equal(readDirectoryPublicContacts(result).phone,"nový text 123 bez validácie");
  assert.equal(readDirectoryPublicContacts(result).instagram,"@mojprofil");
  assert.equal(readDirectoryPublicContacts(result).email,"legacy");
  assert.equal(result.Zameranie,"zachovať");
  assert.equal(Object.hasOwn(result,"Telefon"),false);
  assert.equal(legacy.Telefon,"older", "original object must not be changed");
});
test("explicitly cleared SQL contacts cannot resurrect old import aliases",()=>{
  const result=overlayDirectorySqlContacts({
    "Telefón":"old",Telefon:"ghost",phone:"ghost2",
    "E-mail":"old@example.com",Email:"ghost@example.com",
    Facebook:"old",Instagram:"old",
  },{
    public_phone:"", public_email:"", facebook_url:"",instagram_url:"",
  });
  assert.deepEqual(readDirectoryPublicContacts(result),{
    phone:"",email:"",website:"",facebook:"",instagram:"",
  });
  for(const key of ["Telefón","Telefon","phone","E-mail","Email","Facebook","Instagram"]){
    assert(!Object.hasOwn(result,key),key);
  }
});
test("SQL-only record is readable without legacy JSON",()=>{
  const result=overlayDirectorySqlContacts(null,{public_email:"email"});
  assert.equal(readDirectoryPublicContacts(result).email,"email");
});
test("Admin create/update and Notion field events use 0170 columns in one D1 statement",()=>{
  const store=readFileSync("lib/directory-store.ts","utf8");
  const notion=readFileSync("lib/notion-directory-sync.ts","utf8");
  assert.match(store,/public_phone, public_email, facebook_url, instagram_url/);
  assert.match(store,/public_phone = CASE WHEN \?=1 THEN \? ELSE public_phone END/);
  assert.match(store,/public_email = CASE WHEN \?=1 THEN \? ELSE public_email END/);
  assert.match(store,/payload\.publicPhone === undefined \? 0 : 1/);
  assert.match(store,/overlayDirectorySqlContacts\(safeImportData\(row\.source_data_json/);
  assert.match(notion,/publicPhone: "public_phone"/);
  assert.match(notion,/assignments\.push\(column \+ " = \?"\)/);
});
