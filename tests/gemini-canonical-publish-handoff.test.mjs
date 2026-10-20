import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiAgendaForKey } from "../lib/gemini-notion-agenda-review.ts";
import { planGeminiPublishHandoff } from "../lib/gemini-canonical-publish-handoff.ts";

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
    "ALREADY_PUBLISHED", item.stableKey);
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
