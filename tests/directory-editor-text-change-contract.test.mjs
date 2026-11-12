import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reconcileDirectorySubmittedTextFields } from "../lib/directory-editor-text-change-contract.ts";

const live = { excerpt: "Pôvodný perex", description: "Pôvodný popis" };

test("recovers Perex from Lexical payload when the client omitted its dirty path", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: live,
    submitted: { excerpt: "Pôvodný perex TEST-KLUB-456", description: live.description },
    original: live,
    editedPaths: [],
  });
  assert.deepEqual(result.editedPaths, ["excerpt"]);
  assert.deepEqual(result.recovered, ["excerpt"]);
  assert.deepEqual(result.conflicts, []);
});

test("preserves an independently dirty SEO path and recovers a missed Popis edit", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: live,
    submitted: { excerpt: live.excerpt, description: "Nový popis" },
    original: live,
    editedPaths: ["seo.title"],
  });
  assert.deepEqual(result.editedPaths, ["seo.title", "description"]);
  assert.deepEqual(result.recovered, ["description"]);
  assert.deepEqual(result.conflicts, []);
});

test("stale open Admin form may not overwrite a newer Notion Perex", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: { ...live, excerpt: "Novší perex zo zmeny v Notione" },
    submitted: { excerpt: "Moja zmena z dlho otvoreného formulára" },
    original: live,
    editedPaths: ["seo.title"],
  });
  assert.deepEqual(result.editedPaths, ["seo.title"]);
  assert.deepEqual(result.conflicts, ["excerpt"]);
  assert.deepEqual(result.recovered, []);
});

test("original values missing from old clients cannot authorize implicit changes", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: live,
    submitted: { excerpt: "TEST-KLUB-456" },
    original: undefined,
    editedPaths: [],
  });
  assert.deepEqual(result.editedPaths, []);
  assert.deepEqual(result.conflicts, []);
});

test("already explicit dirty paths remain authoritative; newline normalization cannot fake an edit", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: live,
    submitted: { excerpt: "Pôvodný perex\r\n", description: "Nový popis" },
    original: live,
    editedPaths: ["description"],
  });
  assert.deepEqual(result.editedPaths, ["description"]);
  assert.deepEqual(result.recovered, []);
  assert.deepEqual(result.conflicts, []);
});

test("Directory Admin sends original Lexical text and D1 save checks confirmed persisted fields", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const api = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(editor, /breederOriginalText: \{/);
  assert.match(editor, /excerpt: breederBaseline\?\.excerpt/);
  assert.match(editor, /description: breederBaseline\?\.description/);
  assert.match(api, /reconcileDirectorySubmittedTextFields\(/);
  assert.match(api, /recovered\.conflicts\.length/);
  assert.match(api, /editedPaths = recovered\.editedPaths/);
  assert.match(api, /DIRECTORY_TEXT_D1_SAVE_NOT_CONFIRMED/);
  assert.match(api, /const mismatchedText = \(\["excerpt", "description"\] as const\)/);
  assert.match(api, /status: 409, headers: \{ "cache-control": "no-store" \}/);
});

test("Lexical flushes its latest value on blur, before Save can read stale React state", () => {
  const code = readFileSync("components/admin-lexical-text-field.tsx", "utf8");
  assert.match(code, /const commitOnBlur = \(\) => \{/);
  assert.match(code, /editor\.getEditorState\(\)\.read\(readPlainText\)/);
  assert.match(code, /editor\.registerRootListener/);
  assert.match(code, /addEventListener\("blur", commitOnBlur, true\)/);
  assert.match(code, /removeEventListener\("blur", commitOnBlur, true\)/);
  assert.match(code, /onChangeRef\.current\(next\)/);
});
