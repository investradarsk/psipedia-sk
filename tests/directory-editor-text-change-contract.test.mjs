import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDirectoryEditorTextForSave, selectDirectoryTextForSave, reconcileDirectorySubmittedTextFields } from "../lib/directory-editor-text-change-contract.ts";
import { preserveUneditedTrainerTrust } from "../lib/notion-trainer-trust-fields.ts";

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

test("Directory follows Events: controlled textareas, state diff, one canonical PUT, D1 receipt", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const eventEditor = readFileSync("components/admin-event-editor.tsx", "utf8");
  const api = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(eventEditor, /const response = await fetch\(event \?/);
  assert.match(eventEditor, /eventChangedAdminFields\(/);
  assert.match(editor, /<textarea id="directory-excerpt" rows=\{3\} value=\{excerpt\}/);
  assert.match(editor, /<textarea id="directory-description" rows=\{9\} value=\{description\}/);
  assert.match(editor, /const submittedExcerpt = excerpt;/);
  assert.match(editor, /const submittedDescription = description;/);
  assert.match(editor, /breederAdminChangedFields\(/);
  assert.match(editor, /breederOriginalText: \{/);
  assert.match(editor, /excerpt: breederBaseline\?\.excerpt/);
  assert.match(editor, /description: breederBaseline\?\.description/);
  assert.match(editor, /name, excerpt: submittedExcerpt, description: submittedDescription/);
  assert.match(editor, /status: nextStatus, excerpt: submittedExcerpt, description: submittedDescription/);
  assert.doesNotMatch(editor, /AdminLexicalTextField|valueReaderRef|selectDirectoryTextForSave|excerptExplicitlyEditedRef|descriptionExplicitlyEditedRef/);
  assert.doesNotMatch(editor, /Zmena Perexu alebo Popisu sa nepotvrdila ani po opätovnom načítaní D1/);
  assert.match(api, /DIRECTORY_TEXT_D1_SAVE_NOT_CONFIRMED/);
  assert.match(api, /getManagedDirectoryProfileById\(id, db\)/);
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

test("Perex and Popis changes are independent without Lexical and without Notion input", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const old = { excerpt: "Starý Perex", description: "Odstavec A\n\nOdstavec B" };
  const perexOnly = breederStyleDiff(old, { excerpt: "Starý Perex test444", description: old.description });
  assert.deepEqual(perexOnly, ["excerpt"]);
  const descriptionOnly = breederStyleDiff(old, { excerpt: old.excerpt, description: "Iný popis" });
  assert.deepEqual(descriptionOnly, ["description"]);
  assert.match(editor, /<textarea id="directory-excerpt"/);
  assert.match(editor, /onChange=\{\(event\) => \{ setExcerpt\(event\.target\.value\); setFormDirty\(true\); \}\}/);
  assert.match(editor, /<textarea id="directory-description"/);
  assert.match(editor, /onChange=\{\(event\) => \{ setDescription\(event\.target\.value\); setFormDirty\(true\); \}\}/);
});

function breederStyleDiff(before, after) {
  return ["excerpt", "description"].filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

test("trust-preservation only returns checkboxes and cannot undo ANY Admin editorial edit", () => {
  const oldProfile = {
    id: 618,
    category: "chovatelske-kluby",
    verified: true,
    featured: false,
    name: "Pôvodný názov",
    excerpt: "Starý Perex",
    description: "Starý Popis",
    publicEmail: "povodny@example.sk",
    websiteUrl: "https://stary.sk",
    seo: { title: "Starý SEO title" },
  };
  const form = {
    verified: false,
    featured: true,
    excerpt: "Perex overený v D1 test444",
    description: "Nový Popis",
    publicEmail: "text bez @",
    websiteUrl: "nesprávne URL",
    seo: { title: "Nový SEO title" },
  };
  for (const edited of [[], ["verified"], ["featured"], ["verified", "featured"]]) {
    const trust = preserveUneditedTrainerTrust(oldProfile, form, edited);
    assert.deepEqual(Object.keys(trust).sort(), ["featured", "verified"]);
    const savePayload = { ...form, ...trust };
    assert.equal(savePayload.excerpt, form.excerpt);
    assert.equal(savePayload.description, form.description);
    assert.equal(savePayload.publicEmail, form.publicEmail);
    assert.equal(savePayload.websiteUrl, form.websiteUrl);
    assert.deepEqual(savePayload.seo, form.seo);
  }
});

test("API compares D1 confirmation against actual submitted editorial text", () => {
  const api = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(api, /cleanText\(saved\[field\]\) !== cleanText\(submittedBody\[field\]\)/);
  assert.match(api, /excerpt: submittedBody\.excerpt,\s*description: submittedBody\.description/);
  assert.match(api, /DIRECTORY_TEXT_D1_SAVE_NOT_CONFIRMED/);
  assert.match(api, /DIRECTORY_FIELDS_D1_SAVE_NOT_CONFIRMED/);
  assert.match(api, /status: 409, headers: \{ "cache-control": "no-store" \}/);
});
