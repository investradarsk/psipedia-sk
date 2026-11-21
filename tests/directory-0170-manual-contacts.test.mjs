import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { overlayDirectorySqlContacts } from "../lib/directory-sql-contacts.ts";
import { readDirectoryPublicContacts, omitDirectorySqlContactAliases } from "../lib/directory-profile-metadata.ts";

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

test("marking Odkontrolované changes only SQL review state and bumps revision",()=>{
  const store=readFileSync("lib/directory-store.ts","utf8");
  const start=store.indexOf("export async function setManagedDirectoryProfileReviewed(");
  const end=store.indexOf("export async function archiveManagedDirectoryProfile(",start);
  const review=store.slice(start,end);
  assert.match(review,/INSERT INTO directory_profile_review_state/);
  assert.match(review,/directory0173ReviewCasGuardStatement/);
  assert.doesNotMatch(review,/SET source_data_json/);
  assert.doesNotMatch(review,/COALESCE\(public_phone/);
  assert.match(review,/m\.revoked_at IS NULL/);
  assert.match(review,/reviewed \? 1 : 0/);
});


test("SQL contact persistence omits every alias of explicitly written fields", () => {
  const original = {
    "Telefón": "zastaralé", Telefon: "starší", phone: "staré",
    "E-mail": "stary@example.sk", Email: "stary2@example.sk", email: "stary3@example.sk",
    Web: "zastaralý web", "Webstránka": "zastaralá URL",
    Facebook: "starý FB", Instagram: "starý IG",
    "Chovateľ": "Zachovať", "_psipedia_some_control": "zachovať",
  };
  const sql = omitDirectorySqlContactAliases(original, {
    publicPhone: "nový ľubovoľný text",
    publicEmail: "",
    websiteUrl: null,
    facebookUrl: "https://facebook.com/novy",
    instagramUrl: "@instagram",
  });
  for (const field of ["Telefón","Telefon","phone","E-mail","Email","email",
    "Web","Webstránka","Facebook","Instagram"]) {
    assert.equal(Object.hasOwn(sql, field), false, field);
  }
  assert.equal(sql["Chovateľ"], original["Chovateľ"]);
  assert.equal(sql["_psipedia_some_control"], original["_psipedia_some_control"]);
  assert.equal(original["Telefón"], "zastaralé", "the original JSON is not mutated");
});

test("untouched SQL-NULL contacts keep legacy data until their backfill is confirmed", () => {
  const original = {
    Telefon: "legacy-only phone", "E-mail": "legacy-only email",
    Facebook: "historický Facebook", "Zdroje": "poznámky",
  };
  const sql = omitDirectorySqlContactAliases(original, {
    publicPhone: undefined, publicEmail: undefined, facebookUrl: "",
  });
  assert.equal(sql.Telefon, "legacy-only phone");
  assert.equal(sql["E-mail"], "legacy-only email");
  assert.equal(Object.hasOwn(sql, "Facebook"), false);
  assert.equal(sql["Zdroje"], "poznámky");
});

test("the canonical Admin SQL create/update never persist edited contacts to import JSON", () => {
  const store = readFileSync("lib/directory-store.ts", "utf8");
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  const createBlock=store.slice(
    store.indexOf("export function buildManagedDirectoryProfileCreateStatement("),
    store.indexOf("export async function getPublishedDirectoryProfiles("),
  );
  assert.equal(createBlock.includes("JSON.stringify(omitDirectorySqlContactAliases(input.sourceData, input))"),false);
  assert.match(createBlock,/source_data_json, verified/);
  assert.equal(createBlock.split('"{}"').length-1,2);
  const updateBlock=store.slice(store.indexOf("export function buildManagedDirectoryProfileUpdateStatement("),store.indexOf("export async function updateManagedDirectoryProfile("));
  assert.doesNotMatch(updateBlock, /source_data_json = \?/);
  const start = notion.indexOf("async function saveBreederEditorialValue(");
  const finish = notion.indexOf("  } else if (path === \"seo.noindex\")", start);
  const branch = notion.slice(start, finish);
  assert.doesNotMatch(branch, /source_data_json = \" \+ removed/);
  assert.doesNotMatch(branch, /source_data_json = json_set\(\" \+ removed/);
  assert.match(branch, /assignments\.push\(column \+ \" = \?\"\)/);
});
