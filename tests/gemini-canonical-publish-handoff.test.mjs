import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiAgendaForKey } from "../lib/gemini-notion-agenda-review.ts";
import { planGeminiPublishHandoff } from "../lib/gemini-canonical-publish-handoff.ts";
import { geminiActiveReviewState, geminiCanonicalPublished } from "../lib/gemini-notion-review-state.ts";

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
  assert.equal((component.match(/if \(busy \|\| requestInFlight\.current\) return;/g) ?? []).length, 2,
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
