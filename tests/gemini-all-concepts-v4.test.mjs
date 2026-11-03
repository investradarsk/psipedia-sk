import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geminiAutomationCatalog, geminiAutomationSections } from "../lib/gemini-automation-catalog.ts";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const dashboard = source("components/admin-gemini-automation-settings.tsx");
const dashboardPage = source("app/admin/automatizacie-gemini/page.tsx");
const overview = source("components/admin-gemini-all-concepts.tsx");
const overviewPage = source("app/admin/automatizacie-gemini/koncepty/page.tsx");
const css = source("components/admin-gemini-all-concepts.module.css");

test("Gemini V4 central list uses existing canonical catalog (10/6/6) and only category review endpoints", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.deepEqual(geminiAutomationSections.map(section =>
    geminiAutomationCatalog.filter(item => item.section === section.key).length), [10, 6, 6]);
  assert.match(overview, /geminiAutomationCatalog\.map\(\(item\) => item\.stableKey\)/);
  assert.match(overview, /\/api\/admin\/gemini-automation\/notion-drafts\?stable_key=/);
  assert.match(overview, /Promise\.all\(\[loadNext\(\), loadNext\(\)\]\)/);
  assert.match(overview, /credentials: "same-origin", cache: "no-store"/);
  assert.doesNotMatch(overview, /\/api\/admin\/gemini-automation\/run/);
  // Owner-initiated import, inline revision-guarded Notion saves and safe
  // trash are now the three explicitly permitted mutations.
  assert.match(overview, /fetch\("\/api\/admin\/gemini-automation\/import-pending"/);
  const writes = [...overview.matchAll(/method: "(POST|PUT|PATCH|DELETE)"/g)].map(match => match[1]);
  assert.deepEqual(writes, ["POST", "PUT", "DELETE"]);
  assert.match(overview, /TRASH_NOTION_ONLY_GEMINI_CONCEPT/);
  assert.match(overview, /lastEditedAt: draft.lastEditedAt/);
  assert.match(overview, /setPage/);
  assert.match(overview, /maxPage/);
  const trash = source("app/api/admin/gemini-automation/trash-concept/route.ts");
  assert.match(trash, /requireAdminMutation\(request\)/);
  assert.match(trash, /SELECT entity_id AS id FROM notion_agenda_sync/);
  assert.match(trash, /SELECT canonical_entity_id FROM gemini_notion_created_pages/);
  assert.match(trash, /in_trash: true/);
  assert.doesNotMatch(trash, /DELETE FROM (?:adoption_dogs|directory_profiles)/);
  const importRoute = source("app/api/admin/gemini-automation/import-pending/route.ts");
  assert.match(importRoute, /requireAdminMutation\(request\)/);
  assert.match(importRoute, /confirm !== "IMPORT_PRIVATE_GEMINI_DRAFT"/);
  assert.match(importRoute, /ownerConfirmedLegacy: true/);
  assert.doesNotMatch(importRoute, /status: "(?:published|active)"/);
  assert.doesNotMatch(overview, /\/api\/admin\/gemini-automation\/notion-drafts[^"]*"[^\n]*method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(overviewPage, /listPendingGeminiDirectoryConcepts|listPendingGeminiEventConcepts/);
  assert.match(overviewPage, /requireAdminPageUser/);
});

test("Gemini compact table supports sorting, paging and safe inline edits", () => {
  assert.match(overview, /className=\{styles\.tableScroll\}/);
  assert.match(overview, /<table className=\{styles\.table\}>/);
  assert.match(overview, /displayed\.map\(renderTableRow\)/);
  assert.match(overview, /const PAGE_SIZE = 25/);
  assert.match(overview, /setSortBy/);
  assert.match(overview, /setEditing/);
  assert.match(overview, /method: "PUT"/);
  assert.match(overview, /role="dialog" aria-modal="true"/);
  assert.match(css, /\.table \{/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(dashboard, /className=\{styles\.allConceptsCta\}/);
  assert.match(dashboard, /<strong>Všetky koncepty<\/strong>/);
});

test("overview never invents D1 editor IDs and communicates incomplete sources", () => {
  assert.match(overview, /geminiCanonicalEditorUrl\(draft\)/);
  assert.match(overview, /geminiDraftDeepLink\(item\.stableKey, draft\.id\)/);
  assert.match(overview, /Object\.keys\(errors\)\.length/);
  assert.match(overview, /Zoznam nie je úplný/);
  assert.match(overview, /Načítavam kategórie/);
  assert.match(overview, /const complete = finished === keys\.length/);
  assert.match(dashboardPage, /getGeminiCatalogItem\(key\)/);
  assert.match(dashboardPage, /initialSelectedKey=\{initialSelectedKey\}/);
  assert.match(dashboard, /useState\(initialSelectedKey \?\? settings\[0\]\?\.stableKey/);
  assert.match(dashboard, /<AdminGeminiNotionDrafts key=\{selected\.stableKey\} stableKey=\{selected\.stableKey\}/);
});

test("Gemini adoption validation happens before ambiguous D1 insert and Facebook handoff stays private", () => {
  const sync = source("lib/notion-events-help-sync.ts");
  const validation = sync.indexOf("preflightAdoptionDraft(draftValues)");
  const write = sync.indexOf("importWriteStarted = true;", validation);
  assert.ok(validation > 0 && write > validation, "Pre-insert validation must allow lock cleanup");
  const normalize = source("lib/gemini-draft-import-fields.ts");
  assert.match(normalize, /"psik": "MALE"/);
  assert.match(normalize, /choice\("Aktivita"/);
  const fb = source("app/api/admin/facebook-images/from-profile/route.ts");
  assert.match(fb, /requireAdminMutation\(request\)/);
  assert.match(fb, /copyFacebookProfileImage\(image\)/);
  const facebookImage = source("lib/facebook-profile-image.ts");
  assert.match(facebookImage, /downloadRemoteImage/);
  assert.match(facebookImage, /optimizeRemoteImageForStorage/);
  assert.match(facebookImage, /validMedia/);
  assert.match(facebookImage, /bucket\.put/);
  assert.match(fb, /saveFacebookImagePost\(null/);
  assert.match(fb, /status: "draft"/);
  assert.doesNotMatch(fb, /setIndividualApproval|publishFacebook/);
  const button = source("components/admin-share-to-facebook.tsx");
  assert.match(button, /\/api\/admin\/facebook-images\/from-profile/);
  assert.match(button, /openDraft=/);
  for (const editor of ["directory", "adoption", "event", "help", "lost-found"]) {
    assert.match(source("components/admin-" + editor + "-editor.tsx"), /AdminShareToFacebook/);
  }
  assert.match(source("components/admin-article-editor.tsx"), /stageFacebookArticleDraft/);
  assert.match(source("lib/facebook-article-scheduler.ts"), /prepareFacebookArticleDraft/);
});
