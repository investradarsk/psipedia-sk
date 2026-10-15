import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  return { create: exports.createCanonicalFromNotion, changes };
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
