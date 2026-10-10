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

test("lifecycle: a fresh Gemini concept creates exactly one unpublished canonical draft and one Notion page", async () => {
  const { bridge, db, sqlite } = await lifecycleHarness();
  let postCount = 0;
  globalThis.__geminiNotionBridgeTestHook = async ({ allowCreate, profileId }) => {
    assert.equal(allowCreate, true);
    assert.equal(profileId, 1);
    postCount += 1;
    return { notionPageId: "test-notion-page-1", created: true };
  };
  try {
    const input = { database: db, notion: {}, stableKey: "directory.treneri", candidate };
    const first = await bridge(input);
    assert.equal(first.created, true);
    assert.equal(first.canonicalEntityId, 1);
    assert.equal(first.notionPageId, "test-notion-page-1");
    const draft = sqlite.prepare("SELECT status,published_at,verified,featured,import_key FROM directory_profiles WHERE id=1").get();
    assert.equal(draft.status, "draft");
    assert.equal(draft.published_at, null);
    assert.equal(draft.verified, 0);
    assert.equal(draft.featured, 0);
    assert.match(draft.import_key, /^gemini:[a-f0-9]{64}$/);
    const again = await bridge(input);
    assert.equal(again.created, false);
    assert.equal(again.canonicalEntityId, first.canonicalEntityId);
    assert.equal(again.notionPageId, first.notionPageId);
    assert.equal(postCount, 1);
    assert.deepEqual(sqlite.prepare("SELECT id,entity_type,directory_profile_id FROM partner_resources").all(),
      [{id:"directory-profile-1",entity_type:"DIRECTORY_PROFILE",directory_profile_id:1}]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 1);
    assert.equal(sqlite.prepare("SELECT status FROM gemini_automation_concepts").get().status, "NOTION_LINKED");
  } finally { delete globalThis.__geminiNotionBridgeTestHook; sqlite.close(); }
});

test("lifecycle: Notion create ambiguity recovers existing remote page without another POST", async () => {
  const { bridge, db, sqlite } = await lifecycleHarness();
  const input = { database: db, notion: {}, stableKey: "directory.treneri", candidate };
  const calls = [];
  globalThis.__geminiNotionBridgeTestHook = async ({ allowCreate, profileId }) => {
    calls.push({ allowCreate, profileId });
    if (allowCreate) throw new Error("response lost after remote page creation");
    return { notionPageId: "remote-created-before-network-failure", created: false };
  };
  try {
    await assert.rejects(bridge(input), /response lost/);
    assert.equal(sqlite.prepare("SELECT status FROM gemini_automation_concepts").get().status, "NOTION_UNCERTAIN");
    const recovered = await bridge(input);
    assert.equal(recovered.created, false);
    assert.equal(recovered.notionPageId, "remote-created-before-network-failure");
    assert.equal(sqlite.prepare("SELECT status FROM gemini_automation_concepts").get().status, "NOTION_LINKED");
    assert.deepEqual(calls.map(x => x.allowCreate), [true, false]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 1);
  } finally { delete globalThis.__geminiNotionBridgeTestHook; sqlite.close(); }
});

test("lifecycle: unknown remote Notion create result fails closed rather than retrying the POST", async () => {
  const { bridge, db, sqlite } = await lifecycleHarness();
  const input = { database: db, notion: {}, stableKey: "directory.treneri", candidate };
  const calls = [];
  globalThis.__geminiNotionBridgeTestHook = async ({ allowCreate }) => {
    calls.push(allowCreate);
    if (allowCreate) throw new Error("Notion request result unknown");
    throw new Error("GEMINI_NOTION_REMOTE_CREATE_UNCERTAIN");
  };
  try {
    await assert.rejects(bridge(input), /unknown/);
    await assert.rejects(bridge(input), /REMOTE_CREATE_UNCERTAIN/);
    assert.deepEqual(calls, [true, false]);
    assert.equal(sqlite.prepare("SELECT status FROM gemini_automation_concepts").get().status, "NOTION_UNCERTAIN");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 1);
  } finally { delete globalThis.__geminiNotionBridgeTestHook; sqlite.close(); }
});

// Real SQLite and canonical creation/dedupe run unchanged; only the remote Notion
// transport is substituted to simulate latency, interrupted POST and recovery.
async function lifecycleHarness() {
  const { register } = await import("node:module");
  register(new URL("./gemini-notion-bridge-test-loader.mjs", import.meta.url), import.meta.url);
  const { bridgeGeminiCandidateToNotion: bridge } = await import("../lib/gemini-automation-notion-bridge.ts?test-notion");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0114_gemini_dedupe.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0115_gemini_notion_bridge.sql", import.meta.url), "utf8"));
  sqlite.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, name TEXT, category TEXT,
    status TEXT, excerpt TEXT, description TEXT, services_json TEXT, qualifications_json TEXT,
    city TEXT, region TEXT, address TEXT, postal_code TEXT, street TEXT, house_number TEXT,
    address_format TEXT, service_address_confirmation TEXT, online INTEGER, price_note TEXT,
    website_url TEXT, import_key TEXT UNIQUE, source_data_json TEXT, verified INTEGER, featured INTEGER,
    district TEXT, search_text TEXT, created_at TEXT, updated_at TEXT, published_at TEXT,
    created_by TEXT, updated_by TEXT
  )`);
  sqlite.exec(`CREATE TABLE partner_resources (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL,
    directory_profile_id INTEGER UNIQUE, help_organization_id INTEGER,
    managed_event_id INTEGER, created_at TEXT, updated_at TEXT
  )`);
  const db = { prepare(sql) {
    return { bind(...values) {
      const stmt = sqlite.prepare(sql);
      return {
        async first() { return stmt.get(...values) ?? null; },
        async all() { return { results: stmt.all(...values) }; },
        async run() { const result = stmt.run(...values); return { meta: { changes: result.changes } }; },
      };
    } };
  } };
  return { bridge, db, sqlite };
}

test("recovery from existing import_key self-heals anchor without duplicate profile", async () => {
  const {bridge,db,sqlite}=await lifecycleHarness();
  const key=await geminiBridgeDiscoveryKey("directory.treneri",candidate);
  const input={database:db,notion:{},stableKey:"directory.treneri",candidate};
  sqlite.prepare("INSERT INTO directory_profiles (id,name,category,status,city,website_url,import_key) VALUES (1,?,?,?,?,?,?)")
    .run(candidate.name,"treneri","draft","Nitra",candidate.contacts.website,"gemini:"+key);
  sqlite.prepare("INSERT INTO gemini_automation_concepts (stable_key,discovery_key,canonical_entity_type,status,discovered_at,created_at,updated_at) VALUES (?,?,'DIRECTORY','CREATING',?,?,?)")
    .run("directory.treneri",key,"now","now","2000-01-01T00:00:00.000Z");
  globalThis.__geminiNotionBridgeTestHook=async ({profileId})=>{
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE directory_profile_id=?").get(profileId).n,1);
    return {notionPageId:"recovered",created:true};
  };
  try {
    const result=await bridge(input);
    assert.equal(result.created,false);
    assert.equal(result.status,"NOTION_LINKED");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources").get().n,1);
    await bridge(input);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources").get().n,1);
  }finally{delete globalThis.__geminiNotionBridgeTestHook;sqlite.close();}
});

test("anchor failure is fail-closed before DRAFT_CREATED or Notion",async()=>{
  const {bridge,db,sqlite}=await lifecycleHarness();
  const failing={prepare(sql){
    if(sql.includes("INSERT OR IGNORE INTO partner_resources"))return {bind(){return {async run(){throw Error("ANCHOR_FAILURE")}}}};
    return db.prepare(sql);
  }};
  let notionCalls=0;
  globalThis.__geminiNotionBridgeTestHook=async()=>{notionCalls++;throw Error("Notion must not be called")};
  try{
    await assert.rejects(bridge({database:failing,notion:{},stableKey:"directory.treneri",candidate}),/ANCHOR_FAILURE/);
    assert.equal(notionCalls,0);
    assert.equal(sqlite.prepare("SELECT status FROM gemini_automation_concepts").get().status,"CREATING");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,1);
    const key=await geminiBridgeDiscoveryKey("directory.treneri",candidate);
    sqlite.prepare("UPDATE gemini_automation_concepts SET updated_at=? WHERE discovery_key=?").run("2000-01-01T00:00:00.000Z",key);
    const recovered=await bridge({database:db,notion:{},stableKey:"directory.treneri",candidate});
    assert.equal(recovered.created,false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources").get().n,1);
  }finally{delete globalThis.__geminiNotionBridgeTestHook;sqlite.close();}
});
