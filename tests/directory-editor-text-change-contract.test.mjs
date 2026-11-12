import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDirectoryEditorTextForSave, selectDirectoryTextForSave, reconcileDirectorySubmittedTextFields } from "../lib/directory-editor-text-change-contract.ts";

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


test("last Lexical keystroke wins when React state has not rendered before Save", () => {
  const staleReactValue = "Klub chovateľov dalmatínskych psov test";
  const liveLexicalValue = staleReactValue + "2";
  assert.equal(readDirectoryEditorTextForSave(staleReactValue, () => liveLexicalValue), liveLexicalValue);
  // A deliberate empty string is a real deletion, not a fallback to old state.
  assert.equal(readDirectoryEditorTextForSave(staleReactValue, () => ""), "");
  assert.equal(readDirectoryEditorTextForSave(staleReactValue, null), staleReactValue);
});

test("explicitly edited Perex cannot overwrite a newer conflicting Notion revision", () => {
  const result = reconcileDirectorySubmittedTextFields({
    current: { ...live, excerpt: "Novší zápis z Notionu" },
    submitted: { excerpt: "Môj dopísaný text", description: live.description },
    original: live,
    editedPaths: ["excerpt"],
  });
  assert.deepEqual(result.conflicts, ["excerpt"]);
});

test("same-value concurrent edit is safe and normal explicit Admin edits still save", () => {
  const normal = reconcileDirectorySubmittedTextFields({
    current: live,
    submitted: { excerpt: live.excerpt + " aktualizácia", description: live.description },
    original: live,
    editedPaths: ["excerpt"],
  });
  assert.deepEqual(normal.conflicts, []);
  assert.deepEqual(normal.editedPaths, ["excerpt"]);
  const equal = reconcileDirectorySubmittedTextFields({
    current: { ...live, excerpt: live.excerpt + " aktualizácia" },
    submitted: { excerpt: live.excerpt + " aktualizácia" },
    original: live,
    editedPaths: ["excerpt"],
  });
  assert.deepEqual(equal.conflicts, []);
});

test("Directory Save reads committed Lexical content, posts it, and confirms the persisted D1 text", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const lexical = readFileSync("components/admin-lexical-text-field.tsx", "utf8");
  const api = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(lexical, /const readCurrentText = \(\) => editor\.getEditorState\(\)\.read\(readPlainText\)/);
  assert.match(lexical, /valueReaderRef\.current = readCurrentText/);
  assert.match(lexical, /valueReaderRef\.current === readCurrentText/);
  assert.match(editor, /valueReaderRef=\{excerptValueReaderRef\}/);
  assert.match(editor, /valueReaderRef=\{descriptionValueReaderRef\}/);
  assert.match(editor, /const submittedExcerpt = selectDirectoryTextForSave\(\{/);
  assert.match(editor, /const submittedDescription = selectDirectoryTextForSave\(\{/);
  assert.match(editor, /name, excerpt: submittedExcerpt, description: submittedDescription/);
  assert.match(editor, /status: nextStatus, excerpt: submittedExcerpt, description: submittedDescription/);
  assert.match(editor, /textSaved\(candidate\[field\]\)/);
  assert.match(editor, /freshResponse = await fetch/);
  assert.match(editor, /textMismatch = mismatchedTextFields\(savedProfile\)/);
  assert.match(editor, /throw new Error\("Zmena Perexu alebo Popisu sa nepotvrdila/);
  assert.match(api, /expectedUpdatedAt: before\.updatedAt/);
  assert.match(api, /status: 409, headers: \{ "cache-control": "no-store" \}/);
});

test("an untouched Popis keeps its exact D1 value despite Lexical formatting changes", () => {
  const original = "Odstavec 1\n\nOdstavec 2";
  const serializedByLexical = "Odstavec 1\nOdstavec 2";
  assert.equal(selectDirectoryTextForSave({
    original, stateValue: original, liveReader: () => serializedByLexical,
    explicitlyEdited: false,
  }), original);
  assert.equal(selectDirectoryTextForSave({
    original, stateValue: original, liveReader: () => serializedByLexical,
    explicitlyEdited: true,
  }), serializedByLexical);
  assert.equal(selectDirectoryTextForSave({
    original, stateValue: original, liveReader: () => "",
    explicitlyEdited: true,
  }), "");
});

test("saving only Perex never reports an untouched description mismatch", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const lexical = readFileSync("components/admin-lexical-text-field.tsx", "utf8");
  assert.match(editor, /path !== "description" \|\| descriptionExplicitlyEditedRef\.current/);
  assert.match(editor, /path !== "excerpt" \|\| excerptExplicitlyEditedRef\.current/);
  assert.match(editor, /valueReaderRef=\{excerptValueReaderRef\} onUserInput=/);
  assert.match(editor, /valueReaderRef=\{descriptionValueReaderRef\} onUserInput=/);
  assert.match(editor, /descriptionExplicitlyEditedRef\.current = false/);
  assert.match(editor, /excerptExplicitlyEditedRef\.current = false/);
  assert.match(editor, /descriptionExplicitlyEditedRef\.current = true; setDescription\(appendLexicalPlainText/);
  assert.match(lexical, /root\?\.addEventListener\("input", markRealUserInput\)/);
  assert.match(lexical, /previousRoot\?\.removeEventListener\("input", markRealUserInput\)/);
  assert.match(lexical, /onUserInputRef\.current\?\.\(\)/);
});
