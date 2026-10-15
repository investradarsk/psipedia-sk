import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { registerGeminiCreatedPages, parseGeminiCreatedPages } from "../lib/gemini-notion-provenance.ts";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiImportAgenda } from "../lib/gemini-notion-provenance.ts";
import { notionCategoryValue } from "../scripts/gemini-notion-category.mjs";
import { decideBidirectionalChange } from "../lib/notion-bidirectional-reconciliation.ts";

/**
 * Execute the real production createCanonicalFromNotion function, including its
 * input adapters and Lost/Found privacy sanitization. Stub only the external
 * canonical write boundaries; no D1/Notion/Gemini/Cloudflare network calls.
 */
const source = readFileSync(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function adapterHarness() {
  const changes = [];
  let nextId = 100;
  const capture = (agenda, payload) => {
    const entry = { agenda, payload, id: nextId++ };
    changes.push(entry);
    return entry;
  };
  const require = (id) => {
    if (id.endsWith("notion-seo-contract.ts")) return {
      notionSeoEditableFields: () => [], mergeNotionSeo: () => ({}),
    };
    if (id.endsWith("notion-geo-mirror.ts")) return { notionGeoMirrorProperties: () => ({}) };
    if (id.endsWith("event-store.ts")) return {
      createManagedEvent: async (payload) => capture("events", payload),
    };
    if (id.endsWith("help-organization-admin-write.ts")) return {
      createOrganizationFromAdmin: async (payload) => capture("organizations", payload),
      changeOrganizationPublicationFromAdmin: async () => { throw Error("PUBLICATION_FORBIDDEN"); },
    };
    if (id.endsWith("organization-location-admin-store.ts")) return {
      listOrganizationLocationsAdmin: async () => [],
    };
    if (id.endsWith("organization-location-admin-write.ts")) return {
      createOrganizationLocationFromAdmin: async () => { throw Error("UNEXPECTED_LOCATION_WRITE"); },
      updateOrganizationLocationFromAdmin: async () => { throw Error("UNEXPECTED_LOCATION_WRITE"); },
    };
    if (id.endsWith("adoption-admin-write.ts")) return {
      createAdoptionFromAdmin: async payload => capture("adoptions", payload),
    };
    if (id.endsWith("help-store.ts")) return {
      createManagedHelpCase: async payload => capture("help-cases", payload),
    };
    if (id.endsWith("lost-found-dog-store.ts")) return {
      createAdminDogReport: async payload => capture("lost-found", payload),
    };
    return {};
  };
  const exports = {};
  runInNewContext(js, { exports, require, URL, Error, console, Date }, { timeout: 1000 });
  assert.equal(typeof exports.createCanonicalFromNotion, "function");
  return { create: exports.createCanonicalFromNotion, isPrivate: exports.trustedGeminiSourceIsPrivateDraft, changes };
}
function valuesFor(item) {
  const [section, subcategory] = item.stableKey.split(".");
  const type = notionCategoryValue(section, subcategory);
  const v = {
    "Názov": "Offline " + item.stableKey,
    "Meno": "Offline " + item.stableKey,
    "Slug": "offline-" + subcategory,
    "Stav": "Publikované", "Psipedia stav": "published",
    "Typ podujatia": type, "Kategória": type, "Typ": item.stableKey === "help.utulky" ? "SHELTER" : "LOST",
    "Popis": "Dôkazy:\nhttps://example.test/dog",
    "Mesto": "", "Organizácia": "",
    "Latitude": 48.123456, "Longitude": 18.123456,
    "Presnosť lokality": "EXACT", "Verejný kontakt": "PRIVATE CONTACT",
    "Miesto": "Sensitive street 2",
  };
  return v;
}
test("all 12 non-directory categories call real canonical adapters with draft-only payload", async () => {
  const { create, changes } = adapterHarness();
  const inputDb = { prepare() { throw Error("UNEXPECTED_D1_QUERY"); } };
  const items = geminiAutomationCatalog.filter(item => geminiImportAgenda(item.stableKey) !== "directory");
  assert.equal(items.length, 12);
  for (const item of items) {
    const agenda = geminiImportAgenda(item.stableKey);
    const values = valuesFor(item);
    const output = await create(agenda, values, inputDb, true);
    assert.ok(output.id > 0, item.stableKey);
    const latest = changes.at(-1);
    assert.equal(latest.agenda, agenda, item.stableKey);
    const payload = latest.payload;
    if (agenda === "organizations") {
      assert.equal(payload.name, values["Názov"]);
      assert.equal(payload.type, "SHELTER");
      assert.equal(Object.hasOwn(payload, "publishedAt"), false);
    } else {
      assert.ok(["draft", "DRAFT"].includes(payload.status),
        item.stableKey + " wrote unsafe canonical status " + payload.status);
    }
    if (agenda === "lost-found") {
      assert.equal(payload.publicLatitude, null);
      assert.equal(payload.publicLongitude, null);
      assert.equal(payload.publicContactNote, "");
      assert.equal(payload.locationDescription, values["Mesto"]);
      assert.notEqual(payload.locationDescription, "Sensitive street 2");
      assert.equal(payload.contactPhone, null);
      assert.equal(payload.contactEmail, null);
      assert.equal(payload.contactName, null);
    }
  }
  assert.equal(changes.length, 12);
});
test("untrusted Notion text never bypasses Ready and trusted import requires title+slug", async () => {
  const { create, changes } = adapterHarness();
  const db = { prepare() { throw Error("UNEXPECTED_D1_QUERY"); } };
  const untrusted = valuesFor({ stableKey: "events.vystavy" });
  untrusted.Stav = "Nápad";
  await assert.rejects(() => create("events", untrusted, db, false),
    /nie je v stave pripravenom/);
  assert.equal(changes.length, 0);
  const missing = { ...untrusted, Slug: "" };
  await assert.rejects(() => create("events", missing, db, true),
    /GEMINI_CANONICAL_DRAFT_INCOMPLETE/);
  await assert.rejects(() => create("help-cases", { ...missing, Slug:"nonempty", Kategória:"" }, db, true),
    /GEMINI_HELP_CATEGORY_REQUIRED/);
  await assert.rejects(() => create("lost-found", { ...missing, Slug:"nonempty", Typ:"" }, db, true),
    /GEMINI_LOST_FOUND_TYPE_REQUIRED/);
  assert.equal(changes.length, 0);
});


test("all 22 category canonical editor changes win against unchanged Notion; dual edits require conflict review", () => {
  for (const item of geminiAutomationCatalog) {
    const unchangedNotion = decideBidirectionalChange({
      baselineHash: "last-synced", notionHash: "last-synced",
      psipediaHash: "human-editor-saved",
    });
    assert.equal(unchangedNotion.decision, "PUSH_PSIPEDIA", item.stableKey);
    assert.equal(unchangedNotion.psipediaChanged, true);
    const simultaneous = decideBidirectionalChange({
      baselineHash: "last-synced", notionHash: "Gemini-edited",
      psipediaHash: "human-editor-saved",
    });
    assert.equal(simultaneous.decision, "CONFLICT", item.stableKey);
    assert.notEqual(simultaneous.decision, "PULL_NOTION",
      "Never overwrite a changed editor record from stale Notion");
    assert.equal(decideBidirectionalChange({
      baselineHash: "last-synced", notionHash: "identical-editor-change",
      psipediaHash: "identical-editor-change",
    }).decision, "UNCHANGED");
  }
});

test("production Notion imports persist identity mappings before risky remote writeback", () => {
  const eventsSync = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const directorySync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const eventCreate = eventsSync.slice(eventsSync.indexOf("const created = await createCanonicalFromNotion("));
  const eventMappingAt = eventCreate.indexOf("await saveMapping({");
  const eventNotionAt = eventCreate.indexOf("const written = await writeSourceToNotion({");
  assert.ok(eventMappingAt >= 0 && eventMappingAt < eventNotionAt,
    "Events/Help must map the canonical D1 draft before any unreliable Notion PATCH");
  const directoryCreate = directorySync.slice(directorySync.indexOf("const creation = await createProfileFromNotion({"));
  const dirMappingAt = directoryCreate.indexOf("await saveMapping({");
  const dirNotionAt = directoryCreate.indexOf("await writeProfileToNotion({");
  assert.ok(dirMappingAt >= 0 && dirMappingAt < dirNotionAt,
    "Directory must map before optional R2/GEO/Notion post-processing");
  assert.match(directorySync, /GEMINI_PROVENANCE_IMPORT_CONFLICT/);
  assert.match(eventsSync, /GEMINI_PROVENANCE_IMPORT_CONFLICT/);
});


/**
 * Offline 22-category provenance-to-mapping integration.
 * Executes real 0127 SQL + real signed-receipt *registration* adapter + real
 * non-directory canonical input adapters + real SQLite mapping constraints.
 * The Directory D1/R2 writer and external Notion transport remain mocked: this
 * test MUST NOT be represented as a real production/Cloudflare end-to-end run.
 */
test("offline 22-category provenance-to-mapping: one private canonical ID per page, retry idempotent and editor protected", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys=ON");
    sqlite.exec("CREATE TABLE gemini_manual_background_jobs (id INTEGER PRIMARY KEY)");
    sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, status TEXT NOT NULL)");
    sqlite.exec("CREATE TABLE directory_notion_sync (" +
      "notion_page_id TEXT PRIMARY KEY, directory_profile_id INTEGER NOT NULL UNIQUE, " +
      "content_hash TEXT NOT NULL DEFAULT '', last_synced_at TEXT NOT NULL, " +
      "FOREIGN KEY(directory_profile_id) REFERENCES directory_profiles(id))");
    sqlite.exec("CREATE TABLE event_notion_sync (" +
      "notion_page_id TEXT PRIMARY KEY, event_id INTEGER NOT NULL UNIQUE, content_hash TEXT NOT NULL)");
    sqlite.exec("CREATE TABLE notion_agenda_sync (" +
      "agenda TEXT NOT NULL, notion_page_id TEXT NOT NULL, entity_id INTEGER NOT NULL, " +
      "content_hash TEXT NOT NULL, PRIMARY KEY(agenda,notion_page_id), UNIQUE(agenda,entity_id))");
    sqlite.exec(readFileSync(new URL("../drizzle/0127_gemini_notion_created_pages.sql", import.meta.url), "utf8"));
    const sources = {
      directory: "d1111111-1111-4111-8111-111111111111",
      events: "e1111111-1111-4111-8111-111111111111",
      organizations: "01111111-1111-4111-8111-111111111111",
      adoptions: "a2222222-2222-4222-8222-222222222222",
      "help-cases": "c1111111-1111-4111-8111-111111111111",
      "lost-found": "f1111111-1111-4111-8111-111111111111",
    };
    const env = {
      NOTION_DIRECTORY_DATA_SOURCE_ID: sources.directory,
      NOTION_EVENTS_DATA_SOURCE_ID: sources.events,
      NOTION_ORGANIZATIONS_DATA_SOURCE_ID: sources.organizations,
      NOTION_ADOPTIONS_DATA_SOURCE_ID: sources.adoptions,
      NOTION_HELP_DATA_SOURCE_ID: sources["help-cases"],
      NOTION_LOST_FOUND_DATA_SOURCE_ID: sources["lost-found"],
    };
    const db = {
      prepare(sql) {
        let params=[];
        return {
          bind(...args) { params=args; return this; },
          async run() { const r=sqlite.prepare(sql).run(...params);
            return { meta: { changes: Number(r.changes) } }; },
          async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        };
      },
    };
    const nonDir = adapterHarness();
    const seen = new Map();
    for (const [index, item] of geminiAutomationCatalog.entries()) {
      const agenda = geminiImportAgenda(item.stableKey);
      const pageId = index.toString(16).padStart(8, "0") + "-1111-4111-8111-111111111111";
      const jobId = 1000 + index;
      sqlite.prepare("INSERT INTO gemini_manual_background_jobs(id) VALUES (?)").run(jobId);
      const receipt = {
        notion_page_id: pageId, stable_key: item.stableKey,
        notion_data_source_id: sources[agenda],
      };
      const parsed = parseGeminiCreatedPages([receipt], item.stableKey, 1, env);
      assert.equal(parsed?.agenda, agenda, item.stableKey);
      await registerGeminiCreatedPages(db, jobId, parsed);
      await registerGeminiCreatedPages(db, jobId, parsed);
      // Signed-callback provenance cannot be reassigned to a different job.
      await assert.rejects(() => registerGeminiCreatedPages(db, 9999, parsed),
        /GEMINI_PROVENANCE_COLLISION/, item.stableKey);
      const origin = sqlite.prepare(
        "SELECT * FROM gemini_notion_created_pages WHERE notion_page_id=?").get(pageId);
      assert.equal(origin.stable_key, item.stableKey);
      assert.equal(origin.import_agenda, agenda);
      assert.equal(origin.notion_data_source_id, sources[agenda]);
      assert.equal(origin.canonical_entity_id, null);

      const imported = seen.get(pageId);
      assert.equal(imported, undefined);
      let newId;
      if (agenda === "directory") {
        // Directory writer itself is integration-tested with mocked R2/SQL/GEO
        // in notion-directory-apply-sql-r2-integration.test.mjs. Here only the
        // canonical D1 mapping and status guard are exercised.
        newId = 2000 + index;
        sqlite.prepare("INSERT INTO directory_profiles(id,status) VALUES (?,?)").run(newId, "draft");
        sqlite.prepare("INSERT INTO directory_notion_sync(notion_page_id,directory_profile_id,content_hash,last_synced_at) VALUES (?,?,?,?)")
          .run(pageId,newId,"baseline","t0");
      } else {
        const created = await nonDir.create(agenda, valuesFor(item), {
          prepare() { throw Error("UNEXPECTED_EXTERNAL_D1_QUERY"); },
        }, true);
        newId = Number(created.id);
        const latest = nonDir.changes.at(-1);
        assert.equal(latest.agenda, agenda, item.stableKey);
        if (agenda !== "organizations") {
          assert.ok(["draft", "DRAFT"].includes(latest.payload.status), item.stableKey);
        } else {
          assert.equal(Object.hasOwn(latest.payload,"publishedAt"), false);
        }
        if (agenda === "lost-found") {
          assert.equal(latest.payload.publicLatitude, null);
          assert.equal(latest.payload.publicLongitude, null);
          assert.equal(latest.payload.publicContactNote, "");
          assert.equal(latest.payload.contactPhone, null);
          assert.equal(latest.payload.contactEmail, null);
        }
        if (agenda === "events") {
          sqlite.prepare("INSERT INTO event_notion_sync(notion_page_id,event_id,content_hash) VALUES (?,?,?)")
            .run(pageId,newId,"baseline");
        } else {
          sqlite.prepare("INSERT INTO notion_agenda_sync(agenda,notion_page_id,entity_id,content_hash) VALUES (?,?,?,?)")
            .run(agenda,pageId,newId,"baseline");
        }
      }
      // The real sync always maps before provider writeback. Model an
      // acknowledged canonical insert followed by an uncertain Notion PATCH:
      // retry must recover mapped entity, never create a second entity.
      const readMapping = () => agenda === "directory"
        ? sqlite.prepare("SELECT directory_profile_id AS id FROM directory_notion_sync WHERE notion_page_id=?").get(pageId)?.id
        : agenda === "events"
          ? sqlite.prepare("SELECT event_id AS id FROM event_notion_sync WHERE notion_page_id=?").get(pageId)?.id
          : sqlite.prepare("SELECT entity_id AS id FROM notion_agenda_sync WHERE agenda=? AND notion_page_id=?").get(agenda,pageId)?.id;
      assert.equal(readMapping(), newId, item.stableKey);
      assert.throws(() => {
        if (agenda === "directory") sqlite.prepare("INSERT INTO directory_notion_sync(notion_page_id,directory_profile_id,content_hash,last_synced_at) VALUES (?,?,?,?)").run(pageId,newId+999,"x","t1");
        else if (agenda === "events") sqlite.prepare("INSERT INTO event_notion_sync(notion_page_id,event_id,content_hash) VALUES (?,?,?)").run(pageId,newId+999,"x");
        else sqlite.prepare("INSERT INTO notion_agenda_sync(agenda,notion_page_id,entity_id,content_hash) VALUES (?,?,?,?)").run(agenda,pageId,newId+999,"x");
      }, /UNIQUE constraint failed/, item.stableKey);
      assert.equal(readMapping(), newId);

      // Finalization is identity-bound: a different canonical ID cannot be
      // written after the first accepted mapping.
      const r = sqlite.prepare("UPDATE gemini_notion_created_pages SET canonical_entity_id=?,imported_at=? WHERE notion_page_id=? AND import_agenda=? AND canonical_entity_id IS NULL")
        .run(newId,"t1",pageId,agenda);
      assert.equal(Number(r.changes),1);
      assert.equal(Number(sqlite.prepare("UPDATE gemini_notion_created_pages SET canonical_entity_id=?,imported_at=? WHERE notion_page_id=? AND import_agenda=? AND canonical_entity_id IS NULL")
        .run(newId+1,"t2",pageId,agenda).changes),0);
      const again=sqlite.prepare("SELECT canonical_entity_id FROM gemini_notion_created_pages WHERE notion_page_id=?").get(pageId);
      assert.equal(Number(again.canonical_entity_id),newId);

      const editorOnly = decideBidirectionalChange({
        baselineHash:"baseline",notionHash:"baseline",psipediaHash:"editor-updated",
      });
      assert.equal(editorOnly.decision,"PUSH_PSIPEDIA",item.stableKey);
      const conflict = decideBidirectionalChange({
        baselineHash:"baseline",notionHash:"notion-changed",psipediaHash:"editor-updated",
      });
      assert.equal(conflict.decision,"CONFLICT",item.stableKey);
      seen.set(pageId,newId);
    }
    assert.equal(seen.size,22);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_notion_created_pages").get().n),22);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_notion_created_pages WHERE imported_at IS NULL").get().n),0);
  } finally {
    sqlite.close();
  }
});


test("all 12 trusted Events/Help categories refuse public, archived or rejected Notion rows", () => {
  const { isPrivate } = adapterHarness();
  assert.equal(typeof isPrivate, "function");
  for (const item of geminiAutomationCatalog.filter(row => geminiImportAgenda(row.stableKey) !== "directory")) {
    const agenda = geminiImportAgenda(item.stableKey);
    const values = valuesFor(item);
    if (agenda === "events" || agenda === "organizations" || agenda === "adoptions") {
      for (const allowed of ["Nápad", "Na kontrolu", "Koncept", "Ready"]) {
        assert.equal(isPrivate(agenda, { ...values, "Stav": allowed }), true, item.stableKey + "/" + allowed);
      }
      for (const refused of ["Publikované", "Archív", "Odmietnuté", ""]) {
        assert.equal(isPrivate(agenda, { ...values, "Stav": refused }), false, item.stableKey + "/" + refused);
      }
    } else if (agenda === "help-cases") {
      assert.equal(isPrivate(agenda, { ...values, "Psipedia stav": "draft" }), true, item.stableKey);
      for (const refused of ["published", "ARCHIVED", "rejected", ""]) {
        assert.equal(isPrivate(agenda, { ...values, "Psipedia stav": refused }), false, item.stableKey);
      }
    } else {
      for (const allowed of ["DRAFT", "PENDING"]) {
        assert.equal(isPrivate(agenda, { ...values, "Psipedia stav": allowed }), true, item.stableKey);
      }
      for (const refused of ["ARCHIVED", "PUBLISHED", "published", ""]) {
        assert.equal(isPrivate(agenda, { ...values, "Psipedia stav": refused }), false, item.stableKey);
      }
    }
  }
  const sync = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(sync, /trustedGemini && !trustedGeminiSourceIsPrivateDraft/);
  assert.match(sync, /GEMINI_PRIVATE_DRAFT_REQUIRED/);
});
