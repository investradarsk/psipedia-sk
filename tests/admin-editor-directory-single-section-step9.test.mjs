import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-9: service directory has five independently visible but mounted panels", () => {
  const src = read("components/admin-directory-editor.tsx");
  const css = read("components/admin-directory-editor.module.css");
  const ids = ["directory-main", "directory-location", "directory-content", "directory-contacts", "directory-media-trust"];
  for (const id of ids) assert.match(src, new RegExp('<AdminEditorSection id="' + id + '"'));
  assert.equal((src.match(/<AdminEditorSection id="directory-/g) || []).length, 5);
  assert.match(src, /AdminEditorSectionVisibility.Provider value=\{\{ activeId: activeDirectorySection, mode: "switch" \}\}/);
  assert.match(src, /<AdminSharedEditorNavigation sections=\{editorSections\} activeId=\{activeDirectorySection\} onNavigate=\{setActiveDirectorySection\}/);
  assert.match(src, /layout="sidebar" mode="switch"/);
  assert.match(src, /aria-label="Prechod medzi sekciami služby"/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
  assert.match(css, /@container \(max-width: 860px\)/);
  assert.match(css, /\[data-admin-shared-editor-navigation\] \.mobile/);
});

test("EDITOR-9: Save/Publish reveal the invalid field instead of trapping focus in a hidden section", () => {
  const src = read("components/admin-directory-editor.tsx");
  assert.match(src, /<form ref=\{formRef\} noValidate/);
  assert.match(src, /if \(!name\.trim\(\)\)/);
  assert.match(src, /if \(!slug\.trim\(\)\)/);
  assert.match(src, /element\.willValidate && !element\.checkValidity\(\)/);
  assert.match(src, /invalidControl\.closest<HTMLElement>\("\[data-admin-editor-section\]"\)/);
  assert.match(src, /setActiveDirectorySection\(section\.id\)/);
  assert.match(src, /setAdvancedOpen\(true\)/);
  assert.match(src, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void save\(/);
  assert.match(src, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.equal((src.match(/<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\} className="admin-editor-message"/g) || []).length, 1);
});

test("EDITOR-9: all canonical directory/Notion and media operations are preserved", () => {
  const src = read("components/admin-directory-editor.tsx");
  for (const snippet of [
    "/api/admin/gemini-automation/notion-drafts/",
    'method: profile ? "PUT" : "POST"',
    'action: "set-category-filters"',
    'nextStatus === "published"',
    "setConfirmDirectoryExit(true)",
    "onNotionSaved?.",
    "<DirectoryCategoryFilterFields",
    "<DirectoryAddressAutocomplete",
    "<AdminLexicalTextField",
    "<AdminEditorToolFrame kind=\"contacts\"",
    "<AdminSeoFields",
    "<ImageDisplayEditor",
    "<AdminEditorFooter",
    "<EditorUnsavedChangesGuard",
    "<AdminShareToFacebook",
  ]) assert.ok(src.includes(snippet), snippet);
  assert.doesNotMatch(src, /AdminStickyEditorNavigation/);
});
