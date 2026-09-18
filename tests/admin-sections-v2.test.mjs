import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync("components/admin-section-editor.tsx", "utf8");
const store = readFileSync("lib/section-store.ts", "utf8");
const page = readFileSync("app/admin/sekcie/page.tsx", "utf8");
const puppyCoverage = readFileSync("components/admin-puppy-coverage.tsx", "utf8");

test("SECTION-ADMIN exposes hierarchy, truthful counts and section-to-article navigation", () => {
  assert.match(page, /getManagedPortalSectionArticleCounts/);
  assert.match(store, /GROUP BY portal_section/);
  assert.match(store, /SUM\(CASE WHEN status = 'published'/);
  assert.match(editor, /Hlavná sekcia/);
  assert.match(editor, /Podsekcia/);
  assert.match(editor, /podsekcií/);
  assert.match(editor, /článkov/);
  assert.match(editor, /Články sekcie/);
  assert.match(editor, /Správa článkov/);
});

test("SECTION-ADMIN keeps secondary settings in the shared drawer without inventing rich-text schema", () => {
  assert.match(editor, /AdminDrawer/);
  assert.match(editor, /SEO title/);
  assert.match(editor, /Meta description/);
  assert.match(editor, /Slug \/ adresa/);
  assert.doesNotMatch(editor, /AdminRichTextEditor/);
  assert.doesNotMatch(store, /rich_text_json/);
  assert.match(editor, /plain text/);
});

test("SECTION-ADMIN preserves existing section write contract and explicit destructive preview", () => {
  assert.match(editor, /fetch\("\/api\/admin\/sections"/);
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /window\.confirm/);
  assert.match(store, /cleanSubpages/);
  assert.match(store, /item\.visible === false \? 0 : 1/);
});

test("Puppy coverage uses editorial Slovak labels while preserving current data semantics", () => {
  assert.match(puppyCoverage, /Obsah je pripravený/);
  assert.match(puppyCoverage, /Potrebuje doplniť/);
  assert.match(puppyCoverage, /Chýba obsah/);
  assert.match(puppyCoverage, /Čo treba doplniť/);
  assert.doesNotMatch(puppyCoverage, />COVERED</);
  assert.doesNotMatch(puppyCoverage, />PARTIAL</);
  assert.doesNotMatch(puppyCoverage, />MISSING</);
});
