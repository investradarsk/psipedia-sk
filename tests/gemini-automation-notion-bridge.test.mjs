import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { geminiBridgeDiscoveryKey, mapGeminiDirectoryCandidate, bridgeGeminiCandidateToNotion } from "../lib/gemini-automation-notion-bridge.ts";
import { targetSchemaObjects, assertGeminiBridgeSchema } from "../scripts/production-d1-migrate.mjs";
import { notionRequest } from "../lib/notion-sync-shared.ts";

const candidate = {
  name: "Škola pre psov Nitra",
  primary_url: "https://psiskola.example.sk/",
  source_urls: ["https://psiskola.example.sk/"],
  description: "Výcvik psov v Nitre",
  location: { country: "Slovakia", region: "Nitriansky kraj", district: "Nitra", city: "Nitra", address: null },
  contacts: { website: "https://psiskola.example.sk/", phone: null, email: null, facebook: null, instagram: null },
  confidence: 0.9, evidence: [{ source_url: "https://psiskola.example.sk/", fields: ["name"] }],
};
test("bridge mapping is canonical DIRECTORY draft using server taxonomy only", async () => {
  const key = await geminiBridgeDiscoveryKey("directory.treneri", candidate);
  assert.match(key, /^[a-f0-9]{64}$/);
  const a = mapGeminiDirectoryCandidate("directory.treneri", candidate, key);
  assert.equal(a.entityType, "DIRECTORY");
  assert.equal(a.data.category, "treneri");
  assert.equal(a.data.name, candidate.name);
  assert.equal(a.data.city, "Nitra");
  assert.equal(a.data.description, candidate.description);
  assert.equal(a.data.websiteUrl, candidate.contacts.website);
  assert.equal(a.data.publicPhone, "");
  assert.equal(a.data.verified, undefined);
  assert.equal(a.data.featured, undefined);
  assert.equal(a.data.services, undefined);
  assert.equal(a.data.priceNote, undefined);
  assert.equal(a.data.importKey, "gemini:"+key);
  const other = { ...candidate, description:"Different summary", confidence:0.6 };
  assert.equal(await geminiBridgeDiscoveryKey("directory.treneri",other),key);
  assert.rejects(()=>geminiBridgeDiscoveryKey("directory.treneri",{...candidate,location:{...candidate.location,city:null},contacts:{...candidate.contacts,website:null},primary_url:null}),/IDENTITY/);
  assert.throws(()=>mapGeminiDirectoryCandidate("events.vystavy",candidate,key),/NOT_READY/);
});
test("0115 migration is additive and enforces provenance uniqueness", () => {
  const sql=readFileSync(new URL("../drizzle/0115_gemini_notion_bridge.sql",import.meta.url),"utf8");
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE|TRUNCATE|ALTER)\b/i);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(sql);
    const objects = sqlite.prepare("SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','index')").all();
    assertGeminiBridgeSchema({objects});
    assert.deepEqual(targetSchemaObjects({objects:[]}, "0115_gemini_notion_bridge.sql"),{partial:false});
    assert.deepEqual(targetSchemaObjects({objects}, "0115_gemini_notion_bridge.sql"),{partial:true});
    sqlite.prepare("INSERT INTO gemini_automation_concepts (stable_key,discovery_key,canonical_entity_type,status,discovered_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("directory.treneri","abc","DIRECTORY","RESERVED","now","now","now");
    assert.throws(()=>sqlite.prepare("INSERT INTO gemini_automation_concepts (stable_key,discovery_key,canonical_entity_type,status,discovered_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("directory.treneri","abc","DIRECTORY","RESERVED","now","now","now"),/UNIQUE/);
  } finally { sqlite.close(); }
});
test("completed bridge retry returns existing concept without network or canonical writes", async () => {
  const key=await geminiBridgeDiscoveryKey("directory.treneri",candidate);
  const observed=[];
  const db={prepare(sql){observed.push(sql);return {bind(...values){return {
    async first(){if(sql.includes("FROM gemini_automation_concepts"))return {
      id:10,stable_key:"directory.treneri", discovery_key:key, canonical_entity_type:"DIRECTORY",
      canonical_entity_id:42,notion_page_id:"page-xyz",status:"NOTION_LINKED",
    };throw Error("unexpected db read")},
    async all(){throw Error("unexpected all")},async run(){throw Error("unexpected mutation")}
  }}}}};
  const result=await bridgeGeminiCandidateToNotion({
    database:db,notion:{},stableKey:"directory.treneri",candidate,
  });
  assert.equal(result.created,false);
  assert.equal(result.canonicalEntityId,42);
  assert.equal(result.notionPageId,"page-xyz");
  assert.equal(observed.length,1);
});
test("non-directory type fails closed without database or external calls", async () => {
  await assert.rejects(()=>bridgeGeminiCandidateToNotion({database:{},notion:{},
    stableKey:"events.vystavy",candidate}),/NOT_READY/);
});


test("dedupe gate blocks duplicate, possible match and past rejection before canonical creation", async () => {
  for (const kind of ["DUPLICATE","POSSIBLE_DUPLICATE","REJECTED_BEFORE"]) {
    const observed=[];
    const db={ prepare(sql) { observed.push(sql); return {bind(){return {
      async first() {
        if (sql.includes("FROM gemini_automation_concepts")) return null;
        if (sql.includes("FROM gemini_automation_rejections"))
          return kind === "REJECTED_BEFORE" ? {identity_kind:"name_city",reason_code:"MANUAL_REJECT"} : null;
        throw new Error("unexpected SELECT: "+sql);
      },
      async all() {
        if (!sql.includes("FROM directory_profiles")) throw new Error("unexpected ALL");
        return {results:[{
          id:7, category:"treneri", status:"published", name:candidate.name, city:"Nitra",
          website_url:kind==="POSSIBLE_DUPLICATE"?"https://elsewhere.sk/":candidate.contacts.website,
          source_data_json:"{}",
        }]};
      },
      async run(){throw new Error("canonical mutation forbidden for "+kind);}
    };}};}};
    await assert.rejects(
      ()=>bridgeGeminiCandidateToNotion({database:db,notion:{},stableKey:"directory.treneri",candidate}),
      new RegExp("GEMINI_BRIDGE_DEDUPE_"+kind),
    );
    assert.equal(observed.some(sql=>/^INSERT/i.test(sql.trim())),false,kind);
  }
});

test("bridge Notion creation uses one POST attempt even for retryable 429/503 responses", async () => {
  const notionSource = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(notionSource, /singleAttemptCreate: true/);
  assert.match(notionSource, /createNotionPage\(input\.bindings, input\.dataSourceId, properties, input\.singleAttemptCreate === true\)/);
  assert.match(notionSource, /retryTransient: !singleAttempt/);
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [429, 503]) {
      let requests = 0;
      globalThis.fetch = async () => {
        requests += 1;
        return new Response(JSON.stringify({ message: "transient remote error" }), { status });
      };
      await assert.rejects(
        notionRequest({ NOTION_API_TOKEN: "test-token" }, "/pages",
          { method: "POST", body: "{}" }, { retryTransient: false }),
        new RegExp("Notion API " + status),
      );
      assert.equal(requests, 1, "ambiguous remote create must never retry");
    }
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      if (requests === 1) return new Response("transient", { status: 503 });
      return new Response('{"id":"ok"}', { status: 200 });
    };
    const normal = await notionRequest({ NOTION_API_TOKEN: "test-token" },
      "/data_sources/id/query", { method: "POST", body: "{}" });
    assert.equal(normal.id, "ok");
    assert.equal(requests, 2, "existing retry behavior for idempotent Notion queries must be retained");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
