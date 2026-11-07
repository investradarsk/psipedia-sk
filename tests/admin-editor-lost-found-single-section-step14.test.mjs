import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-lost-found-editor.tsx");
const css = read("components/admin-lost-found.module.css");

const panel = (id) => {
  const start = editor.indexOf('<AdminEditorSection id="' + id + '"');
  assert.notEqual(start, -1, "Missing panel " + id);
  const end = editor.indexOf("</AdminEditorSection>", start);
  assert.ok(end > start, "Unclosed panel " + id);
  return editor.slice(start, end);
};

test("EDITOR-14: seven mounted panels preserve original Lost/Found editor structure", () => {
  const expected = [
    ["lost-found-basics", "Typ a stav prípadu"],
    ["lost-found-dog", "Pes a plemeno"],
    ["lost-found-description", "Popis a identifikácia"],
    ["lost-found-location", "Dátum a bezpečná lokalita"],
    ["lost-found-contacts", "Kontakt a súkromie"],
    ["lost-found-media", "Fotografie a galéria"],
    ["lost-found-moderation", "Životnosť a moderácia"],
  ];
  const definition = editor.match(/const LOST_FOUND_SECTIONS = \[[\s\S]*?\n\];/)?.[0];
  assert.ok(definition);
  const actual = [...definition.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(actual, expected);
  assert.equal((editor.match(/<AdminEditorSection id=/g) ?? []).length, 7);
  assert.equal((editor.match(/<\/AdminEditorSection>/g) ?? []).length, 7);
  assert.match(editor, /<AdminEditorSectionVisibility\.Provider value=\{\{ activeId: activeLostFoundSection, mode: "switch" \}\}/);
  assert.match(editor, /<AdminSharedEditorNavigation sections=\{LOST_FOUND_SECTIONS\}/);
  assert.match(editor, /layout="sidebar" mode="switch"/);
  assert.match(editor, /Prechod medzi sekciami stratených a nájdených psov/);
  assert.match(css, /\.editorLayout/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
});

test("EDITOR-14: media, safe location, encrypted contacts and moderation remain distinct", () => {
  assert.ok(panel("lost-found-basics").includes("dogReportStatusLabel"));
  assert.ok(panel("lost-found-dog").includes("breedUnknown"));
  assert.ok(panel("lost-found-dog").includes("breeds.map"));
  assert.ok(panel("lost-found-description").includes('<AdminLexicalTextField rows={7}'));
  assert.doesNotMatch(panel("lost-found-description"), /AdminSingleImageUpload|AdminPhotoGallery/);
  assert.ok(panel("lost-found-location").includes("publicLocationPrecision"));
  assert.ok(panel("lost-found-location").includes("Nezadávaj domácu adresu"));
  assert.ok(panel("lost-found-contacts").includes("Kontaktná osoba — iba admin"));
  assert.ok(panel("lost-found-contacts").includes("Telefón — iba admin"));
  assert.ok(panel("lost-found-contacts").includes("E-mail — iba admin"));
  assert.ok(panel("lost-found-media").includes("AdminPhotoGallery"));
  assert.ok(panel("lost-found-media").includes("AdminSingleImageUpload"));
  assert.ok(panel("lost-found-media").includes("onClick={()=>setImageEditorOpen(true)"));
  assert.ok(panel("lost-found-moderation").includes("markDuplicate()"));
  assert.ok(panel("lost-found-moderation").includes("Interná moderátorská poznámka"));
  assert.equal((editor.match(/<AdminPhotoGallery/g) ?? []).length, 1);
  assert.equal((editor.match(/<AdminSingleImageUpload/g) ?? []).length, 1);
  assert.equal((editor.match(/<AdminFormFeedback/g) ?? []).length, 1);
});

test("EDITOR-14: no new persistence, publishing, duplicate, or PII disclosure contract", () => {
  assert.match(editor, /<form ref=\{formRef\} noValidate/);
  assert.match(editor, /state\.description\.trim\(\)\.length >= 20/);
  assert.match(editor, /setActiveLostFoundSection\(missing\.section\)/);
  assert.match(editor, /method:report\?"PUT":"POST"/);
  assert.match(editor, /\/api\/admin\/lost-found/);
  assert.match(editor, /report\?status:"DRAFT"/);
  assert.match(editor, /allowedLostFoundTransitions\(state\.status\)/);
  assert.match(editor, /\/api\/admin\/lost-found\/\$\{report\.id\}\/duplicate/);
  assert.match(editor, /<EditorUnsavedChangesGuard active=\{navigation\.dirty\}/);
  assert.match(editor, /<AdminEditorFooter dirty=\{navigation\.dirty\}/);
  assert.match(editor, /privatePreview/);
  assert.match(editor, /state\.publicContactNote/);
  assert.doesNotMatch(editor, /<aside[^>]*>[^]*?state\.contactPhone/);
  assert.doesNotMatch(editor, /<aside[^>]*>[^]*?state\.contactEmail/);
  assert.equal((editor.match(/<form\b/g) ?? []).length, 1);
  assert.equal((editor.match(/<\/form>/g) ?? []).length, 1);
});
