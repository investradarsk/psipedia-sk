import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { geminiAutomationCatalog, getGeminiCatalogItem } from "../lib/gemini-automation-catalog.ts";
import { geminiImportAgenda } from "../lib/gemini-notion-provenance.ts";
import { planGeminiPublishHandoff } from "../lib/gemini-canonical-publish-handoff.ts";
import { geminiValidNotionDraftId } from "../lib/gemini-concept-manager.ts";

const pageId = "11111111-1111-4111-8111-111111111111";
const source = readFileSync(new URL("../lib/gemini-canonical-save-sync.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(item, options = {}) {
  let reads = 0;
  const calls = [];
  const agenda = geminiImportAgenda(item.stableKey);
  const draft = {
    id: pageId, psipediaId: "", canonicalVerified: false, reviewState: "NEW", lastEditedAt: "saved-v2",
    ...(agenda === "directory" ? { category: item.subcategory } : { agenda, stableKey: item.stableKey }),
    ...options.before,
  };
  const read = async () => ++reads === 1 ? draft : {
    ...draft, psipediaId: "77", canonicalVerified: true, reviewState: "IMPORTED", ...options.after,
  };
  const summary = { enabled: true, schemaReady: true, failed: 0, createdFromNotion: 1,
    totals: { failed: 0, conflicts: 0, createdFromNotion: 1 }, agendas: [{ targetMissing: false }], ...options.summary };
  const sync = async input => { calls.push(input); if (options.failure) throw Error("uncertain"); return summary; };
  const modules = {
    "./gemini-notion-provenance": { geminiImportAgenda },
    "./gemini-canonical-publish-handoff": { planGeminiPublishHandoff },
    "./gemini-notion-directory-review": { getGeminiDirectoryDraft: read },
    "./gemini-notion-agenda-review": { getGeminiAgendaDraft: async () => ({ draft: await read() }) },
    "./notion-directory-sync": { runNotionDirectorySyncSweep: sync },
    "./notion-events-help-sync": { runNotionEventsHelpSyncSweep: sync },
    "./gemini-concept-manager": { geminiValidNotionDraftId },
    "./gemini-automation-catalog": { getGeminiCatalogItem },
  };
  const exports = {};
  runInNewContext(js, { exports, require: id => {
    assert.ok(modules[id], `Unexpected boundary: ${id}`); return modules[id];
  } });
  const database = { prepare(sql) {
    assert.match(sql, /gemini_notion_created_pages/);
    return { bind(id, key, importAgenda) {
      assert.equal(id, pageId); assert.equal(key, item.stableKey); assert.equal(importAgenda, agenda);
      return { first: async () => options.signed === false ? null : { notion_page_id: pageId } };
    } };
  } };
  return { calls, run: (override = {}) => exports.reconcileGeminiSavedDraft({
    database, bindings: { NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED: "false" },
    key: item.stableKey, notionPageId: pageId, savedRevision: "saved-v2", ...override,
  }) };
}

test("all 22 saves target one signed page/revision and return only verified private native-editor handoff", async () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  for (const item of geminiAutomationCatalog) {
    const h = harness(item);
    const result = await h.run();
    assert.equal(result.state, "CANONICAL_DRAFT_READY", item.stableKey);
    assert.match(result.editorUrl, /^\/admin\//);
    assert.equal(h.calls.length, 1);
    const call = h.calls[0];
    assert.equal(call.targetPageId, pageId);
    assert.equal(call.expectedNotionRevision, "saved-v2");
    assert.equal(call.force, undefined, "Never override production enablement");
    if (geminiImportAgenda(item.stableKey) !== "directory")
      assert.deepEqual(Array.from(call.agendas), [geminiImportAgenda(item.stableKey)]);
  }
});

test("missing provenance, missing saved revision, concurrent edits and existing mappings never invoke import", async () => {
  for (const item of geminiAutomationCatalog) {
    for (const options of [
      { signed: false }, { before: { lastEditedAt: "human-v3" } },
      { before: { reviewState: "REJECTED" } },
      { before: { reviewState: "PUBLISHED", psipediaId: "77", canonicalVerified: true } },
      { before: { reviewState: "IMPORTED", psipediaId: "77", canonicalVerified: true } },
      { before: { psipediaId: "77", canonicalVerified: false } },
    ]) {
      const h = harness(item, options);
      assert.notEqual((await h.run()).state, "CANONICAL_DRAFT_READY", item.stableKey);
      assert.equal(h.calls.length, 0);
    }
    const h = harness(item);
    assert.equal((await h.run({ savedRevision: "" })).state, "NOTION_ONLY");
    assert.equal(h.calls.length, 0);
  }
});

test("disabled/incomplete/error/conflict/uncertain import never claims success or retries", async () => {
  for (const item of geminiAutomationCatalog) {
    const failures = [{ enabled: false }, { schemaReady: false }, { failed: 1, totals: { failed: 1 } },
      { createdFromNotion: 0, totals: { createdFromNotion: 0 } }];
    if (geminiImportAgenda(item.stableKey) !== "directory") failures.push(
      { agendas: [{ targetMissing: true }] }, { totals: { conflicts: 1 } });
    for (const summary of failures) {
      const h = harness(item, { summary });
      assert.equal((await h.run()).state, "NEEDS_REVIEW", item.stableKey);
      assert.equal(h.calls.length, 1);
    }
    for (const after of [{ psipediaId: "", canonicalVerified: false },
      { reviewState: "PUBLISHED" }, { reviewState: "REJECTED" }]) {
      assert.equal((await harness(item, { after }).run()).state, "NEEDS_REVIEW");
    }
    const h = harness(item, { failure: true });
    await assert.rejects(h.run(), /uncertain/);
    assert.equal(h.calls.length, 1);
  }
});

// Execute the production import critical section with only I/O boundaries mocked.
// This covers the exact lock scope and uncertain-write branch, not a replica.
const syncSource = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
const start = syncSource.indexOf("    let releaseImport: (() => Promise<void>) | null = null;");
const end = syncSource.indexOf("\n  // Canonical GEO", start);
assert.ok(start > 0 && end > start);
const criticalJs = ts.transpileModule(`async function runImport() { for (const page of [input.page]) {
${syncSource.slice(start, end)} return summary; }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function importHarness(options = {}) {
  const held = new Set(options.held ?? []), released = [], operations = [];
  const summary = { conflicts: 0, unchanged: 0, createdFromNotion: 0, failed: 0 };
  const source = { id: 77, properties: {} };
  const page = { id: pageId, last_edited_time: "saved-v2" };
  const input = { page, definition: { key: "events", load: async () => [source] },
    database: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }) }, bindings: {} };
  const context = { input, summary, sources: [], sourcesById: new Map(), schema: {},
    trustedGemini: true, values: { "Názov": "Offline", "Slug": "offline" }, target: { dataSourceId: "ds" },
    acquireGeminiNotionLock: async (_db, id) => {
      if (held.has(id)) return null;
      held.add(id); return async () => { held.delete(id); released.push(id); };
    },
    loadMappings: async () => options.mapped ? [{ notion_page_id: pageId }] : [],
    notionRequest: async () => options.changed ? { ...page, last_edited_time: "human-v3" } : page,
    sourceDuplicateCandidate: () => options.duplicate ? 77 : null,
    clean: v => String(v ?? ""), resolveGeminiPublicSlug: async () => "offline",
    createCanonicalFromNotion: async () => { operations.push("create"); if (options.failCreate) throw Error("timeout"); return { id: 77 }; },
    sourceById: rows => new Map(rows.map(row => [row.id, row])),
    snapshotHash: async () => "hash", editableSnapshot: () => ({}), canonicalUpdatedAt: async () => "canonical-v1",
    saveMapping: async () => { operations.push("mapping"); if (options.failMapping) throw Error("D1_FAILURE"); },
    writeSourceToNotion: async () => { operations.push("notion"); if (options.failNotion) throw Error("timeout"); return { last_edited_time: "notion-v3" }; },
    logFailure: () => { summary.failed++; }, patchPage: async () => {}, encodeProperties: v => v,
  };
  runInNewContext(criticalJs, context);
  return { held, released, operations, summary, run: context.runImport };
}

test("scheduler and targeted imports serialize page and agenda identity checks before any create", async () => {
  for (const options of [{ held: ["gemini-canonical-import-events"] }, { held: [pageId] },
    { mapped: true }, { duplicate: true }, { changed: true }]) {
    const h = importHarness(options);
    await h.run();
    assert.equal(h.operations.length, 0);
    assert.equal(h.summary.createdFromNotion, 0);
    assert.equal(h.held.size, options.held?.length ?? 0, "Release only our own pre-write locks");
  }
  const h = importHarness();
  await h.run();
  assert.deepEqual(h.operations, ["create", "mapping", "notion", "mapping"]);
  assert.equal(h.summary.createdFromNotion, 1);
  assert.equal(h.held.size, 0);
});

test("ambiguous insert, mapping or Notion acknowledgement retains shared import/page locks", async () => {
  for (const options of [{ failCreate: true }, { failMapping: true }, { failNotion: true }]) {
    const h = importHarness(options);
    await h.run();
    assert.equal(h.summary.failed, 1);
    assert.equal(h.summary.createdFromNotion, 0);
    assert.deepEqual([...h.held], ["gemini-canonical-import-events", pageId]);
    assert.equal(h.operations.filter(v => v === "create").length, 1);
    assert.equal(h.released.length, 0);
  }
});

test("targeted Directory save never bootstraps unrelated canonical profiles", () => {
  const source = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(source, /const changedIds = input\.targetPageId \? \[\] : await changedProfileIds/);
  assert.match(source, /const bootstrapIds = input\.targetPageId \? \[\] : await bootstrapProfileIds/);
});


test("all Gemini Events/Help no-change Saves preserve Notion revision and allow safe canonical reconciliation", async () => {
  const source = readFileSync(new URL("../lib/gemini-notion-agenda-review.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function mutateGeminiAgendaDraft(");
  assert.ok(start > 0, "Exercise the production mutation entrypoint");
  const code = ts.transpileModule(source.slice(start), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  class GeminiAgendaReviewError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const id = "11111111-1111-4111-8111-111111111111";
  for (const item of geminiAutomationCatalog.filter(item => geminiImportAgenda(item.stableKey) !== "directory")) {
    const draft = {
      lastEditedAt: "saved-v2", psipediaId: "", reviewState: "NEW",
      agenda: geminiImportAgenda(item.stableKey), fields: [], name: "Safe test",
    };
    function harness(options = {}) {
      let lockReleased = 0, notionWrites = 0, calls = 0;
      const context = {
        exports: {}, ID: /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
        GeminiAgendaReviewError,
        acquireGeminiNotionLock: async () => options.busy ? null : async () => { lockReleased++; },
        getGeminiAgendaDraft: async () => {
          calls++;
          return { draft: { ...draft, ...options.draft }, page: {}, source: {}, trusted: true };
        },
        notionRequest: async () => { notionWrites++; throw Error("No Notion API needed for unchanged save"); },
      };
      runInNewContext(code, context);
      const run = (body = { action: "save", lastEditedAt: "saved-v2", fields: {} }) =>
        context.exports.mutateGeminiAgendaDraft({ DB: {} }, item.stableKey, id, body, "test-admin");
      return { run, stats: () => ({ lockReleased, notionWrites, calls }) };
    }
    const unchanged = harness();
    const result = await unchanged.run();
    assert.equal(result.lastEditedAt, "saved-v2", item.stableKey);
    assert.equal(result.psipediaId, "", item.stableKey);
    assert.deepEqual(unchanged.stats(), { lockReleased: 1, notionWrites: 0, calls: 1 }, item.stableKey);

    const stale = harness();
    await assert.rejects(stale.run({ action: "save", lastEditedAt: "stale", fields: {} }),
      error => error.code === "CONFLICT", item.stableKey);
    assert.deepEqual(stale.stats(), { lockReleased: 1, notionWrites: 0, calls: 1 });

    const imported = harness({ draft: { psipediaId: "99" } });
    await assert.rejects(imported.run(), error => error.code === "STATE", item.stableKey);
    assert.equal(imported.stats().notionWrites, 0);

    const busy = harness({ busy: true });
    await assert.rejects(busy.run(), error => error.code === "LOCKED", item.stableKey);
    assert.deepEqual(busy.stats(), { lockReleased: 0, notionWrites: 0, calls: 0 });
  }
  const api = readFileSync(new URL("../app/api/admin/gemini-automation/notion-drafts/[id]/route.ts", import.meta.url), "utf8");
  assert.match(api, /canonicalSave = await reconcileGeminiSavedDraft\(/,
    "PUT must reconcile even when the Notion save was unchanged");
});


test("approved, evidence-only legacy agenda drafts use the same scoped private handoff", async () => {
  for (const item of geminiAutomationCatalog.filter(x => x.section !== "directory")) {
    const h = harness(item, { signed: false, before: {
      reviewState: "APPROVED", attribution: "EVIDENCE_SIGNATURE_ONLY",
    }});
    const result = await h.run();
    assert.equal(result.state, "CANONICAL_DRAFT_READY", item.stableKey);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].reviewedLegacy, true);
    assert.equal(h.calls[0].targetPageId, pageId);
    assert.equal(h.calls[0].expectedNotionRevision, "saved-v2");
  }
});
test("unapproved legacy pages and unsigned directory pages cannot use legacy handoff", async () => {
  for (const item of geminiAutomationCatalog) {
    const h = harness(item, { signed: false, before: {
      reviewState: "NEW", attribution: "EVIDENCE_SIGNATURE_ONLY",
    }});
    assert.equal((await h.run()).state, "NOTION_ONLY");
    assert.equal(h.calls.length, 0);
    if (item.section === "directory") {
      const approved = harness(item, { signed: false, before: {
        reviewState: "APPROVED", attribution: "EVIDENCE_SIGNATURE_ONLY",
      }});
      assert.equal((await approved.run()).state, "NOTION_ONLY");
      assert.equal(approved.calls.length, 0);
    }
  }
});
