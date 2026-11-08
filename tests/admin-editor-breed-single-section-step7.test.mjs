import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-7: canonical breed editor has exactly 7 Notion-model mounted sections", () => {
  const breed = read("components/admin-breed-editor.tsx");
  const workspace = read("components/admin-editor-workspace.tsx");
  const section = read("components/admin-interaction-system.tsx");
  const visibility = read("components/admin-editor-section-visibility.tsx");
  const ids = ["basic","overview","character","practical","health","sports","media"];
  for (const id of ids) {
    assert.match(breed, new RegExp('AdminEditorSection id="breed-' + id + '"'));
    assert.match(breed, new RegExp('\\{id:"breed-' + id + '"'));
  }
  assert.equal((breed.match(/<AdminEditorSection id="breed-/g) ?? []).length, 7);
  assert.match(breed, /sectionMode="switch"/);
  assert.match(breed, /activeSectionId=\{activeBreedSection\}/);
  assert.match(breed, /onSectionChange=\{setActiveBreedSection\}/);
  assert.match(workspace, /sectionMode = "scroll"/); // other canonical editors unchanged
  assert.match(workspace, /sectionMode === "switch"/);
  assert.match(workspace, /<AdminEditorSectionVisibility\.Provider/);
  assert.match(workspace, /mode=\{sectionMode\}/);
  assert.match(section, /useContext\(AdminEditorSectionVisibility\)/);
  assert.match(section, /hidden=\{hidden\}/);
  assert.match(section, /data-editor-section-active/);
  assert.match(visibility, /createContext/);
  assert.doesNotMatch(visibility, /fetch\s*\(|notion|DATABASE_URL|onSubmit/);
});

test("EDITOR-7: breed value ownership and save path remain canonical; hidden required fields are checked", () => {
  const breed = read("components/admin-breed-editor.tsx");
  for (const field of ["fciNumber","fciStandard","editorial","sports","relatedBreedIds","relatedArticleIds","directoryProfileIds","sources","gallery","seo","expectedUpdatedAt"]) {
    assert.match(breed, new RegExp("\\b" + field + "\\b"), field);
  }
  assert.match(breed, /<form id="breed-canonical-editor-form"[^>]*noValidate/);
  assert.match(breed, /if \(!form\.name\.trim\(\)\)/);
  assert.match(breed, /if \(!form\.intro\.trim\(\)\)/);
  assert.match(breed, /if \(!form\.slug\.trim\(\)\)/);
  assert.match(breed, /chooseBreedSection\("breed-basic"\)/);
  assert.match(breed, /chooseBreedSection\("breed-overview"\)/);
  assert.match(breed, /setSettingsOpen\(true\)/);
  assert.match(breed, /method:breed\?"PUT":"POST"/);
  assert.match(breed, /body:JSON\.stringify\(\{\.\.\.form,/);
  assert.match(breed, /setExpectedUpdatedAt\(data\.breed\.updatedAt\)/);
  assert.match(breed, /setDirty\(false\)/);
  assert.match(breed, /uploadAdminImage\(file,"breeds"\)/);
  assert.match(breed, /<AdminSortableGallery/);
  assert.match(breed, /SEO podľa Notionu/);
  assert.match(breed, /<span>Meta description<\/span>/);
  assert.doesNotMatch(breed, /<AdminSeoFields|<AdminBreedNotionExtras/);
  assert.match(breed, /<AdminDrawer/);
});

test("EDITOR-7: obsolete relation editor is absent; Notion sports and media remain editable", () => {
  const breed = read("components/admin-breed-editor.tsx");
  const css = read("components/admin-breed-editor.module.css");
  const workspaceCss = read("components/admin-editor-workspace.module.css");
  assert.doesNotMatch(breed, /<AdminBreedRelationGroup|breed-relations|activeRelationKind/);
  assert.match(breed, /saveSport\(\)/);
  assert.match(breed, /moveSport\(index/);
  assert.match(breed, /moveGallery\(index/);
  assert.match(breed, /<AdminGalleryDropzone/);
  assert.match(css, /\.sectionPager/);
  assert.match(workspaceCss, /data-editor-section-mode="switch"/);
  assert.match(workspaceCss, /\[data-admin-editor-section\]\[hidden\]/);
});

test("EDITOR-7: legacy editors retain their scroll-mode workspaces", () => {
  const article = read("components/admin-article-editor.tsx");
  const event = read("components/admin-event-editor.tsx");
  const breed = read("components/admin-breed-editor.tsx");
  for (const source of [article,event]) {
    assert.match(source, /<EditorWorkspace/);
    assert.doesNotMatch(source, /sectionMode="switch"/);
  }
  assert.match(breed, /<EditorUnsavedChangesGuard|<EditorWorkspace/);
  assert.match(breed, /dirty=\{dirty\}/);
  assert.match(breed, /onClose=/);
});
