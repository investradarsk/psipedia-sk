import test from "node:test";
import assert from "node:assert/strict";
import { checkGeminiHelpCanonicalDedupe } from "../lib/gemini-external-help-dedupe.ts";

const candidate = {
  name: "Pomoc psom Nitra", city: "Nitra",
  website: "https://pomoc.example/akcia", source: "https://pomoc.example/akcia",
  start_date: "2026-10-20", organizer: "Združenie Psí dom",
  venue: "Nitra", type: "LOST",
};
function offlineDb(rows = {}, { error = false, incomplete = false } = {}) {
  const reads = [];
  const db = { prepare(sql) {
    reads.push(sql);
    let limit = 0;
    const stmt = {
      bind(n) { limit = n; return stmt; },
      async all() {
        if (error) throw Error("OFFLINE_DB_UNAVAILABLE");
        const table = ["help_cases","help_organizations","adoption_dogs",
          "lost_found_dog_reports","directory_profiles"].find(t => sql.includes("FROM " + t));
        if (!table || /private_details|contact_phone|public_phone|public_email|latitude|longitude/i.test(sql))
          throw Error("UNSAFE_QUERY");
        const contents = rows[table] ?? [];
        return { results: incomplete ? Array.from({length:limit}, () => ({})) : contents.slice(0, limit) };
      },
    };
    return stmt;
  }};
  return { db, reads };
}
const checks = [
  ["help.docasna-opatera", {title:candidate.name, category:"docasna-opatera",
    organization:candidate.organizer,city:candidate.city,action_url:candidate.source,status:"draft"}, "help_cases"],
  ["help.zbierky", {title:candidate.name, category:"zbierky",
    organization:candidate.organizer,city:candidate.city,action_url:candidate.source,status:"published"}, "help_cases"],
  ["help.dobrovolnictvo", {title:candidate.name, category:"dobrovolnictvo",
    organization:candidate.organizer,city:candidate.city,action_url:candidate.source,status:"archived"}, "help_cases"],
  ["help.utulky", {name:candidate.name,city:candidate.city,website_url:candidate.website,
    source_url:candidate.source,type:"SHELTER",status:"ARCHIVED"}, "help_organizations"],
  ["help.adopcia", {name:candidate.name,city:candidate.city,organization_name:candidate.organizer,
    external_source_url:candidate.source,status:"ADOPTED"}, "adoption_dogs"],
  ["help.stratene-a-najdene", {type:"LOST",dog_name:"Neznámy",
    city:candidate.city,event_date:candidate.start_date,
    source_url:candidate.source,status:"RESOLVED"}, "lost_found_dog_reports"],
];
test("all six Help categories have independent public-only read-only D1 checks", () => {
  assert.equal(checks.length, 6);
  assert.equal(new Set(checks.map(([k])=>k)).size, 6);
});
for (const [key, row, table] of checks) {
  test(key + " exact canonical identity forbids duplicate even if archived", async () => {
    const {db,reads} = offlineDb({[table]:[row]});
    assert.equal(await checkGeminiHelpCanonicalDedupe(db,key,candidate),"DUPLICATE");
    assert.ok(reads.some(sql => sql.includes("FROM " + table)));
    assert.ok(reads.every(sql => !/private|contact|address|latitude|longitude|geo_/i.test(sql)));
  });
  test(key + " no canonical row with sufficient proof is NEW", async () => {
    const {db} = offlineDb();
    assert.equal(await checkGeminiHelpCanonicalDedupe(db,key,candidate),"NEW");
  });
  test(key + " canonical scan cap is fail closed", async () => {
    const {db} = offlineDb({}, {incomplete:true});
    await assert.rejects(() => checkGeminiHelpCanonicalDedupe(db,key,candidate),
      /CANONICAL_SCAN_INCOMPLETE/);
  });
  test(key + " unavailable D1 never yields NEW", async () => {
    const {db} = offlineDb({}, {error:true});
    await assert.rejects(() => checkGeminiHelpCanonicalDedupe(db,key,candidate),
      /DB_UNAVAILABLE/);
  });
}
test("generic Help same source in another category is a possible match, not a forced merge", async()=>{
  const {db}=offlineDb({help_cases:[{title:candidate.name,category:"zbierky",
    city:candidate.city,organization:candidate.organizer,action_url:candidate.source}]});
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.dobrovolnictvo",candidate),
    "POSSIBLE_DUPLICATE");
});
test("shelter with only Directory profile is not treated as NEW", async()=>{
  const {db}=offlineDb({directory_profiles:[{name:candidate.name,city:candidate.city,
    website_url:candidate.website,status:"published"}]});
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.utulky",candidate),
    "POSSIBLE_DUPLICATE");
});
test("same adoption dog name alone is not sufficient for a confirmed duplicate", async()=>{
  const {db}=offlineDb({adoption_dogs:[{name:candidate.name,city:candidate.city,
    organization_name:"Iná organizácia",external_source_url:"https://other.example/dog"}]});
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.adopcia",candidate),
    "POSSIBLE_DUPLICATE");
});
test("lost-found same city, event date and type still needs human identity review", async()=>{
  const {db}=offlineDb({lost_found_dog_reports:[{type:"LOST",city:candidate.city,
    event_date:candidate.start_date,source_url:"https://other.example/case"}]});
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.stratene-a-najdene",candidate),
    "POSSIBLE_DUPLICATE");
});
test("lost-found cannot clear an unknown case type or event date", async()=>{
  const {db}=offlineDb();
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.stratene-a-najdene",
    {...candidate,type:""}),"BLOCKED");
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.stratene-a-najdene",
    {...candidate,start_date:""}),"BLOCKED");
});
test("Help requires a grounded public URL, never private identity evidence", async()=>{
  const {db}=offlineDb();
  assert.equal(await checkGeminiHelpCanonicalDedupe(db,"help.zbierky",
    {...candidate,source:"",website:""}),"BLOCKED");
});
