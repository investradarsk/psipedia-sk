import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiAgendaForKey } from "../lib/gemini-notion-agenda-review.ts";
import { planGeminiPublishHandoff } from "../lib/gemini-canonical-publish-handoff.ts";
import { geminiActiveReviewState, geminiCanonicalPublished } from "../lib/gemini-notion-review-state.ts";
import { reconcileProfileFields, trustedProfileBaselineFromHashes } from "../lib/notion-profile-field-reconciliation.ts";
import { decideBidirectionalChange } from "../lib/notion-bidirectional-reconciliation.ts";

test("all 22 categories require matching canonical D1 identity for a publication handoff", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  for (const item of geminiAutomationCatalog) {
    const agenda = geminiAgendaForKey(item.stableKey);
    const draft = {
      psipediaId: "", canonicalVerified: false, reviewState: "NEW",
      ...(agenda ? { agenda, stableKey: item.stableKey } : { category: item.subcategory }),
    };
    assert.equal(planGeminiPublishHandoff(item.stableKey, draft).kind, "IMPORT_REQUIRED", item.stableKey);
    assert.equal(planGeminiPublishHandoff(item.stableKey, { ...draft,
      psipediaId: "77", canonicalVerified: false }).kind, "INVALID", item.stableKey);
    const mapped = planGeminiPublishHandoff(item.stableKey, { ...draft,
      psipediaId: "77", canonicalVerified: true, reviewState: "IMPORTED" });
    assert.equal(mapped.kind, "NATIVE_EDITOR_REQUIRED", item.stableKey);
    assert.equal(typeof mapped.editorUrl, "string");
    assert.match(mapped.editorUrl, /^\/admin\//);
    assert.equal(planGeminiPublishHandoff(item.stableKey, { ...draft,
      psipediaId: "77", canonicalVerified: true, reviewState: "PUBLISHED" }).kind,
    "NATIVE_EDITOR_REQUIRED", item.stableKey);
    assert.equal(planGeminiPublishHandoff(item.stableKey, { ...draft,
      psipediaId: "77", canonicalVerified: true, reviewState: "REJECTED" }).kind,
    "INVALID", item.stableKey);
    const incorrect = agenda ? { ...draft, stableKey: "help.invalid" } : { ...draft, category: "invalid" };
    assert.equal(planGeminiPublishHandoff(item.stableKey, { ...incorrect,
      psipediaId: "77", canonicalVerified: true }).kind, "INVALID", item.stableKey);
  }
});

test("legacy POST never represents Notion approval as completed public D1 publishing", () => {
  const route = readFileSync(new URL("../app/api/admin/gemini-automation/notion-drafts/[id]/publish/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /geminiValidNotionDraftId\(id\)/);
  assert.match(route, /planGeminiPublishHandoff\(key, draft\)/);
  assert.match(route, /input\.lastEditedAt/);
  assert.match(route, /IMPORT_REQUIRED/);
  assert.doesNotMatch(route, /approveGeminiDirectoryDraft|mutateGeminiAgendaDraft|PENDING_SYNC/);
  const editor = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /notionDraft && nextStatus === "published"/);
  assert.doesNotMatch(editor, /PENDING_SYNC|notion-drafts\/.*\/publish/);
  const page = readFileSync(new URL("../app/admin/automatizacie-gemini/notion-koncepty/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /draft\.psipediaId && !draft\.canonicalVerified/);
});

test("no guessed canonical route from untrusted identities", () => {
  const draft = {category: "veterinari",psipediaId: "../fake",canonicalVerified: true,reviewState: "IMPORTED"};
  assert.equal(planGeminiPublishHandoff("directory.veterinari",draft).kind,"INVALID");
  assert.equal(planGeminiPublishHandoff("directory.treneri",{...draft,psipediaId:"1"}).kind,"INVALID");
  assert.equal(planGeminiPublishHandoff("invalid",{...draft,psipediaId:"1"}).kind,"INVALID");
});

test("Notion PUBLISHED status does not assert live D1 publication", () => {
  for (const item of geminiAutomationCatalog) {
    const agenda = geminiAgendaForKey(item.stableKey);
    const draft = { psipediaId: "93", canonicalVerified: true, reviewState: "PUBLISHED",
      ...(agenda ? { agenda, stableKey: item.stableKey } : { category: item.subcategory }) };
    const result = planGeminiPublishHandoff(item.stableKey, draft);
    assert.equal(result.kind, "NATIVE_EDITOR_REQUIRED", item.stableKey);
    assert.ok(result.editorUrl?.startsWith("/admin/"), item.stableKey);
  }
});
test("save and review reject mismatched or unknown Gemini stable_key before write", () => {
  const route = readFileSync(new URL("../app/api/admin/gemini-automation/notion-drafts/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /const item = key \? getGeminiCatalogItem\(key\) : null/g);
  assert.match(route, /current\.category !== item\.subcategory/g);
  assert.match(route, /Zápis sa nevykonal/g);
  assert.match(route, /geminiValidNotionDraftId\(id\)/g);
});

test("agenda publish handoff is explicit, guarded, and never reports public state from Notion", () => {
  const component = readFileSync(new URL("../components/admin-gemini-agenda-draft-editor.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/gemini-automation/notion-drafts/[id]/publish/route.ts", import.meta.url), "utf8");
  assert.match(component, /async function openCanonicalPublisher\(\)/);
  assert.match(component, /field\.editable && !Object\.is\(values\[field\.name\], baseline\[field\.name\]\)/);
  assert.match(component, /\/publish\?stable_key=/);
  assert.match(component, /result\.status !== "NATIVE_EDITOR_REQUIRED"/);
  assert.match(component, /result\.published !== false/);
  assert.match(component, /window\.location\.assign\(result\.editorUrl\)/);
  assert.match(component, /draft\.canonicalVerified !== true/);
  assert.match(route, /published: false/);
  assert.doesNotMatch(route, /mutateGeminiAgendaDraft|approveGeminiDirectoryDraft/);
});

test("agenda save, review and publish handoff use one synchronous single-flight lock", () => {
  const component = readFileSync(new URL("../components/admin-gemini-agenda-draft-editor.tsx", import.meta.url), "utf8");
  assert.match(component, /const requestInFlight = useRef\(false\)/);
  assert.equal((component.match(/if \(busy \|\| requestInFlight\.current \|\| canonicalEditorUrl\) return;/g) ?? []).length, 2,
    "Both save/review and publish must reject double clicks before a pending React rerender");
  assert.equal((component.match(/requestInFlight\.current = true;/g) ?? []).length, 2);
  assert.equal((component.match(/requestInFlight\.current = false;/g) ?? []).length, 2,
    "Error and finalization both release the UI single-flight guard");
  assert.match(component, /window\.location\.assign\(result\.editorUrl\)/);
  assert.match(component, /finally \{\s*requestInFlight\.current = false;\s*setBusy\(false\);/);
});

test("all 22 published statuses are read back from canonical D1, not editable Notion labels", async () => {
  // Execute the actual published-state projection and D1 JOINs used by the
  // live Gemini list, with only the database response mocked.
  const agendaSource = readFileSync(new URL("../lib/gemini-notion-agenda-review.ts", import.meta.url), "utf8");
  const directorySource = readFileSync(new URL("../lib/gemini-notion-directory-review.ts", import.meta.url), "utf8");
  const snippets = [
    agendaSource.slice(agendaSource.indexOf("async function enrichCanonicalMappings("),
      agendaSource.indexOf("async function trustedPageIds(")),
    directorySource.slice(directorySource.indexOf("async function enrichCanonical("),
      directorySource.indexOf("export async function reviewGeminiDirectoryDraft(")),
  ];
  for (const source of snippets) assert.ok(source.length > 400, "Canonical JOIN source must be present");
  const js = ts.transpileModule(snippets.join("\n") +
    "\nexports.enrichAgenda = enrichCanonicalMappings; exports.enrichDirectory = enrichCanonical;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  class GeminiAgendaReviewError extends Error {}
  runInNewContext(js, { exports, GeminiAgendaReviewError, geminiCanonicalPublished,
    normalized: id => id.replaceAll("-", "").toLowerCase() });

  const id = "11111111-1111-4111-8111-111111111111";
  const tableByAgenda = {
    events: "managed_events", organizations: "help_organizations",
    adoptions: "adoption_dogs", "help-cases": "help_cases",
    "lost-found": "lost_found_dog_reports",
  };
  const publicStatus = {
    events: "published", organizations: "PUBLISHED", adoptions: "ACTIVE",
    "help-cases": "published", "lost-found": "ACTIVE",
  };
  for (const item of geminiAutomationCatalog) {
    const agenda = geminiAgendaForKey(item.stableKey);
    const original = { id, reviewState: "APPROVED", psipediaId: "999",
      canonicalVerified: false, stableKey: item.stableKey };
    async function exercise({ mapped, status }) {
      const queries = [];
      const env = { DB: { prepare(sql) {
        return { bind(...params) {
          queries.push({ sql, params });
          return { all: async () => ({ results: mapped
            ? [{ notion_page_id: id, entity_id: 77, id: 77, canonical_status: status, status }] : [] }) };
        } };
      } } };
      const projection = { ...original };
      const [result] = agenda
        ? await exports.enrichAgenda(env, agenda, [projection])
        : await exports.enrichDirectory(env, [projection]);
      assert.equal(queries.length, 1);
      if (agenda) {
        assert.match(queries[0].sql, /JOIN /);
        assert.ok(queries[0].sql.includes(tableByAgenda[agenda]), item.stableKey);
        if (agenda !== "events") assert.equal(queries[0].params[0], agenda);
      } else {
        assert.match(queries[0].sql, /JOIN directory_profiles/);
      }
      return result;
    }
    // A Notion label or free-text ID without a live mapping is never public.
    const unverified = await exercise({ mapped: false, status: "published" });
    assert.equal(unverified.canonicalVerified, false, item.stableKey);
    assert.equal(unverified.reviewState, "APPROVED", item.stableKey);
    assert.equal(geminiActiveReviewState(unverified.reviewState), true, item.stableKey);

    const draft = await exercise({ mapped: true, status: agenda ? "draft" : "draft" });
    assert.equal(draft.psipediaId, "77", item.stableKey);
    assert.equal(draft.canonicalVerified, true, item.stableKey);
    assert.equal(draft.reviewState, "IMPORTED", item.stableKey);
    assert.equal(geminiActiveReviewState(draft.reviewState), true, item.stableKey);

    const published = await exercise({ mapped: true, status: agenda ? publicStatus[agenda] : "published" });
    assert.equal(published.canonicalVerified, true, item.stableKey);
    assert.equal(published.reviewState, "PUBLISHED", item.stableKey);
    assert.equal(geminiActiveReviewState(published.reviewState), false,
      "After real D1 publication the item must disappear from the active queue: " + item.stableKey);
  }
});

test("verified canonical Save keeps the review modal open and stops stale Notion edits", () => {
  const agenda = readFileSync(new URL("../components/admin-gemini-agenda-draft-editor.tsx", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  const manager = readFileSync(new URL("../components/admin-gemini-notion-drafts.tsx", import.meta.url), "utf8");
  assert.match(agenda, /setCanonicalEditorUrl\(data\.canonicalSave\.editorUrl!\)/);
  assert.match(directory, /setCanonicalEditorUrl\(data\.canonicalSave\.editorUrl!\)/);
  for (const component of [agenda, directory]) {
    assert.match(component, /Otvoriť overený D1 editor/);
    assert.match(component, /CANONICAL_DRAFT_READY/);
  }
  assert.match(agenda, /const readOnly = Boolean\(canonicalEditorUrl\)/);
  assert.match(directory, /const notionReadOnly = Boolean\(notionDraft && \(canonicalEditorUrl/);
  assert.match(manager, /function saved\(keepEditorOpen = false\)/);
  assert.match(manager, /if \(keepEditorOpen\) clearDirty\(\);/);
});

test("mapped Directory native publication pushes verified D1 status to the same Notion page, never pulls it back", async () => {
  // Run the *actual* production syncMappedPage function with mocked D1 and
  // remote I/O, not a hand-written facsimile of its conflict/authority rules.
  const code = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const start = code.indexOf("async function syncMappedPage(");
  const end = code.indexOf("\nasync function recoverMappingFromPage(", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(code.slice(start,end) +
    "\nexports.syncMappedPage = syncMappedPage;", {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const id = "11111111-1111-4111-8111-111111111111";
  const directoryKeys = geminiAutomationCatalog.filter(item => item.section === "directory");
  assert.equal(directoryKeys.length, 10);
  for (const item of directoryKeys) {
    async function scenario(notionStatus, pageId = id) {
      const writes = [], edits = [], profiles = [];
      const exports = {};
      const profile = {id: 77, category: item.subcategory, status: "published", imageUrl: "",
        websiteUrl: "", updatedAt: "2026-10-21T20:00:00Z"};
      const context = {
        exports, structuredClone, reconcileProfileFields, trustedProfileBaselineFromHashes,
        gemini22PriorityEnabled: () => false,
        getManagedDirectoryProfileById: async () => profile,
        fetchNotionPage: async () => {throw Error("Should reuse the explicit page");},
        propertyText: (page,key) => key === "Psipedia ID" ? "77" : "",
        getMediaSourceMonitorForEntity: async () => null,
        externalSourceImageUrl: () => "",
        profileSnapshot: p => ({ status: p.status }),
        notionSnapshot: page => ({ status: page.status }),
        snapshotHash: async snapshot => snapshot.status,
        readProfileFieldBaseline: async () => null,
        loadGeoMirror: async () => null,
        writeProfileToNotion: async input => { writes.push({
          pageId: input.pageId, status: input.profile.status,
          profileId: input.profile.id,
        }); return {id: input.pageId}; },
        applyNotionToProfile: async input => { edits.push(input); throw Error("NOTION_MUST_NOT_PUBLISH_OR_OVERWRITE"); },
        recordProfileFieldBaseline: async () => {},
      };
      runInNewContext(js, context);
      const mapping = {notion_page_id: id, directory_profile_id: 77,
        content_hash: "draft", notion_last_edited_time: "notion-original"};
      const page = {id: pageId, status: notionStatus, last_edited_time: "notion-original"};
      const run = () => exports.syncMappedPage({database: {}, bindings: {
        NOTION_GEMINI_22_PRIORITY_A_ENABLED: "false",
      }, dataSourceId: "configured-notion-source", mapping, page});
      return {run, writes, edits, profiles};
    }
    const accepted = await scenario("draft");
    assert.equal(await accepted.run(), "pushed", item.stableKey);
    assert.equal(accepted.writes.length, 1, item.stableKey);
    assert.deepEqual(accepted.writes[0], {pageId:id, status:"published",profileId:77}, item.stableKey);
    assert.equal(accepted.edits.length, 0, item.stableKey);
    const changedBoth = await scenario("archived");
    await assert.rejects(changedBoth.run(), /LOSSLESS_FIELD_REVIEW_REQUIRED/, item.stableKey);
    assert.equal(changedBoth.writes.length, 0, "A concurrent Notion edit must never be overwritten");
    assert.equal(changedBoth.edits.length, 0, "A concurrent Notion edit must never publish the profile");
    const identity = await scenario("draft", "22222222-2222-4222-8222-222222222222");
    await assert.rejects(identity.run(), /IDENTITY_CONFLICT/, item.stableKey);
    assert.equal(identity.writes.length, 0, "A mismatched Notion identity may not be written");
  }
});

test("Events and Help native publication uses D1-led writeback only after verified Notion echo", () => {
  const source = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const start = source.indexOf('if (decision.decision !== "UNCHANGED" && !legacyPriorityEnabled)');
  const end = source.indexOf("// Approved Events-only precedence",start);
  assert.ok(start > 0 && end > start);
  const branch = source.slice(start,end);
  const write = branch.indexOf("const written = await writeSourceToNotion({");
  const echo = branch.indexOf("NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH");
  const map = branch.indexOf("await saveMapping({");
  assert.ok(write >= 0 && echo > write && map > echo,
    "Never acknowledge a Notion mirror state before checking the actual written editorial payload");
  assert.match(branch,/const protectedFields = new Set\(\[/);
  assert.match(branch,/"Stav", "Psipedia stav"/);
  assert.match(branch,/await applyNotionToCanonical\(agenda, entityId, merged, input.database\)/);
  for (const item of geminiAutomationCatalog.filter(item => item.section !== "directory")) {
    assert.ok(geminiAgendaForKey(item.stableKey), item.stableKey);
    const decision = decideBidirectionalChange({baselineHash:"draft",notionHash:"draft",
      psipediaHash:"published"});
    assert.equal(decision.decision,"PUSH_PSIPEDIA",item.stableKey);
    const baseline = {"Stav":"draft","Psipedia stav":"Koncept","Popis":"Evidencia"};
    const notion = {...baseline};
    const canonical = {...baseline,"Stav":"published","Psipedia stav":"Publikované"};
    const resolved = reconcileProfileFields({baseline,notion,psipedia:canonical,
      protectedFields:new Set(["Stav","Psipedia stav"])});
    assert.equal(resolved.kind,"MERGE",item.stableKey);
    assert.equal(resolved.merged["Stav"],"published",item.stableKey);
    assert.equal(resolved.merged["Psipedia stav"],"Publikované",item.stableKey);
    const unauthorized = reconcileProfileFields({baseline,notion:{...notion,"Stav":"published"},
      psipedia:baseline,protectedFields:new Set(["Stav","Psipedia stav"])});
    assert.equal(unauthorized.kind,"CONFLICT",item.stableKey);
    assert.ok(unauthorized.conflicts.some(c=>c.reason==="PROTECTED_FIELD"),item.stableKey);
  }
});
