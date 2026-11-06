import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("components/admin-help-editor.tsx");
const css = read("components/admin-help-bulk.module.css");

function panel(id) {
  const start = source.indexOf('<AdminEditorSection id="' + id + '"');
  assert.notEqual(start, -1, "Missing panel: " + id);
  const end = source.indexOf("</AdminEditorSection>", start);
  assert.ok(end > start, "Unclosed panel: " + id);
  return source.slice(start, end);
}

test("EDITOR-12: six mounted Help panels use shared sidebar/mobile switch navigation", () => {
  const expected = [
    ["help-basics", "Základné údaje"],
    ["help-place", "Zaradenie a lokalita"],
    ["help-story", "Prípad a pes"],
    ["help-action", "Výzva a zbierka"],
    ["help-media", "Fotografia a stav"],
    ["help-seo", "SEO"],
  ];
  const sectionBlock = source.match(/const HELP_SECTIONS =[\s\S]*?\n\];/)?.[0];
  assert.ok(sectionBlock);
  const actual = [...sectionBlock.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(actual, expected);
  assert.equal((source.match(/<AdminEditorSection id="help-/g) ?? []).length, 6);
  assert.equal((source.match(/<\/AdminEditorSection>/g) ?? []).length, 6);
  assert.match(source, /<AdminEditorSectionVisibility\.Provider value=\{\{ activeId: activeHelpSection, mode: "switch" \}\}/);
  assert.match(source, /<AdminSharedEditorNavigation sections=\{HELP_SECTIONS\}/);
  assert.match(source, /layout="sidebar" mode="switch"/);
  assert.match(source, /aria-label="Prechod medzi sekciami pomoci psom"/);
  assert.match(css, /\.helpEditorLayout/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
  assert.match(css, /@media \(max-width: 820px\)/);
});

test("EDITOR-12: Help fields, Lexical, gallery, SEO and preview remain mounted once", () => {
  const expected = {
    "help-basics": ["help-title", "help-excerpt"],
    "help-place": ["help-category", "help-organization", "help-region", "help-city", "help-location"],
    "help-story": ["help-description", "help-dog-name", "help-breed", "help-age", "help-reported", "help-deadline"],
    "help-action": ["help-action-label", "help-action-url", "help-goal", "help-raised", "help-contact-note"],
    "help-media": ["help-slug"],
  };
  for (const [id, fields] of Object.entries(expected)) {
    const content = panel(id);
    for (const field of fields) assert.ok(content.includes('id="' + field + '"'), "Missing " + field + " in " + id);
  }
  for (const fields of Object.values(expected)) {
    for (const field of fields) {
      assert.equal((source.match(new RegExp('id="' + field + '"', "g")) ?? []).length, 1, "Duplicate " + field);
    }
  }
  assert.equal((source.match(/<AdminLexicalTextField/g) ?? []).length, 2);
  assert.ok(panel("help-story").includes("<AdminLexicalAppendButton"));
  assert.ok(panel("help-media").includes("<AdminSingleImageUpload"));
  assert.ok(panel("help-media").includes("<AdminShareToFacebook"));
  assert.ok(panel("help-seo").includes("<AdminSeoFields"));
  assert.match(source, /admin-help-preview/);
  assert.match(source, /<ImageDisplayEditor/);
});

test("EDITOR-12: publish errors reveal the correct section; canonical writes, guards and dedicated modules unchanged", () => {
  assert.match(source, /setActiveHelpSection\(missing\.section\)/);
  assert.match(source, /nextStatus === "published"/);
  assert.match(source, /excerpt\.trim\(\)\.length >= 20/);
  assert.match(source, /description\.trim\(\)\.length >= 40/);
  assert.match(source, /if \(mutationPending\.current \|\| uploading\) return/);
  assert.match(source, /method: item \? "PUT" : "POST"/);
  assert.match(source, /\x60\/api\/admin\/help\/\$\{item\.id\}\x60/);
  assert.match(source, /<EditorUnsavedChangesGuard active=\{navigation\.dirty\}/);
  assert.match(source, /<AdminEditorFooter dirty=\{navigation\.dirty\}/);
  assert.match(source, /<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
  assert.match(source, /HELP_ADMIN_CREATE_CATEGORIES/);
  assert.match(source, /href="\/admin\/adopcie"/);
  assert.match(source, /href="\/admin\/stratene-najdene"/);
  assert.match(source, /href="\/admin\/organizacie"/);
  assert.doesNotMatch(source, /window\.location\.(?:reload|assign)/);
  assert.equal((source.match(/<form\b/g) ?? []).length, 1, "No nested forms");
  assert.equal((source.match(/<AdminFormFeedback/g) ?? []).length, 1);
});
