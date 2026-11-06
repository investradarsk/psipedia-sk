import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-adoption-editor.tsx");
const profile = read("components/admin-adoption-editor-profile.tsx");
const details = read("components/admin-adoption-editor-details.tsx");
const css = read("components/admin-adoption-editor.module.css");

const sectionMarkup = (id, source) => {
  const start = source.indexOf('<AdminEditorSection id="' + id + '"');
  assert.ok(start >= 0, "missing " + id);
  const end = source.indexOf("</AdminEditorSection>", start);
  assert.ok(end > start, "unclosed " + id);
  return source.slice(start, end);
};

test("EDITOR-13: all 8 adoption sections share the navigation and remain mounted", () => {
  const expected = [
    ["adoption-basics", "Základné údaje"],
    ["adoption-dog", "Plemeno a profil"],
    ["adoption-location", "Lokalita"],
    ["adoption-personality", "Povaha a kompatibilita"],
    ["adoption-medical", "Zdravie"],
    ["adoption-contact", "Organizácia a kontakt"],
    ["adoption-media", "Fotografie"],
    ["adoption-verification", "Stav a overenie"],
  ];
  const navigation = editor.match(/const ADOPTION_SECTIONS = \[[\s\S]*?\n\];/)?.[0];
  assert.ok(navigation);
  const actual = [...navigation.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)]
    .map(m => [m[1], m[2]]);
  assert.deepEqual(actual, expected);
  assert.equal((editor.match(/<AdminEditorSection id=/g) ?? []).length, 1);
  assert.equal((profile.match(/<AdminEditorSection id=/g) ?? []).length, 3);
  assert.equal((details.match(/<AdminEditorSection id=/g) ?? []).length, 4);
  for (const [id] of expected) {
    assert.ok([editor, profile, details].some(source => source.includes('<AdminEditorSection id="' + id + '"')));
  }
  assert.match(editor, /<AdminSharedEditorNavigation sections=\{ADOPTION_SECTIONS\}/);
  assert.match(editor, /layout="sidebar" mode="switch"/);
  assert.match(editor, /<AdminEditorSectionVisibility\.Provider value=\{\{ activeId: activeAdoptionSection, mode: "switch" \}\}/);
  assert.match(editor, /Prechod medzi sekciami adopcie/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
  assert.ok(profile.startsWith('"use client";'));
});

test("EDITOR-13: breed, organization, safety and images retain canonical form fields", () => {
  const fields = [
    ["adoption-basics", editor, ["adoption-name", "adoption-slug", "adoption-status"]],
    ["adoption-dog", profile, ["adoption-breed", "adoption-sex", "adoption-birth", "adoption-age"]],
    ["adoption-location", profile, ["adoption-region", "adoption-city"]],
    ["adoption-personality", profile, ["adoption-short", "adoption-description", "adoption-temperament"]],
    ["adoption-medical", details, ["adoption-vaccination", "adoption-health", "adoption-requirements"]],
    ["adoption-contact", details, ["adoption-organization-id", "adoption-email", "adoption-phone"]],
    ["adoption-media", details, ["adoption-main-image"]],
    ["adoption-verification", details, ["adoption-verified"]],
  ];
  for (const [id, source, expectedFields] of fields) {
    const panel = sectionMarkup(id, source);
    for (const field of expectedFields) assert.ok(panel.includes('id="' + field + '"'), field + " is not in " + id);
  }
  assert.match(editor, /<AdminAdoptionEditorProfile/);
  assert.match(editor, /<AdminAdoptionEditorDetails/);
  assert.match(details, /<AdminPhotoGallery value=\{gallery\}/);
  assert.match(editor, /<ImageDisplayEditor/);
  assert.match(editor, /<AdminShareToFacebook/);
  assert.match(profile, /<AdminLexicalTextField/);
  assert.match(details, /<AdminLexicalTextField/);
  assert.match(profile, /type="hidden" name="breedId" value=\{item\.breedId\}/);
});

test("EDITOR-13: hidden-panel validation is explicit, original API concurrency and lifecycle remain intact", () => {
  assert.match(editor, /<form ref=\{formRef\} noValidate/);
  assert.match(editor, /new FormData\(event\.currentTarget\)/);
  assert.match(editor, /control\.willValidate && !control\.checkValidity\(\)/);
  assert.match(editor, /invalid\.closest\("\[data-admin-editor-section\]"\)/);
  assert.match(editor, /setActiveAdoptionSection\(owner\?\.id/);
  assert.match(editor, /expectedUpdatedAt: version/);
  assert.match(editor, /canTransitionAdoptionStatus\(persistedStatus, next\)/);
  assert.match(editor, /method: item \? "PUT" : "POST"/);
  assert.match(editor, /<EditorUnsavedChangesGuard active=\{navigation\.dirty\}/);
  assert.match(editor, /<AdminEditorFooter dirty=\{navigation\.dirty\}/);
  assert.match(editor, /<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
  assert.equal((editor.match(/<form\b/g) ?? []).length, 1);
  assert.equal((editor.match(/<AdminFormFeedback/g) ?? []).length, 1);
  assert.doesNotMatch(editor, /DELETE FROM adoption_dogs/);
});
