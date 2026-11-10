import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("breed Admin section pager follows the public profile order", () => {
  const source = read("components/admin-breed-editor.tsx");
  const workspace = read("components/admin-editor-workspace.tsx");
  const section = read("components/admin-interaction-system.tsx");
  const visibility = read("components/admin-editor-section-visibility.tsx");
  const ids = [
    "overview", "basic", "character", "practical", "health",
    "fit", "fci", "media", "settings",
  ];
  const nav = source.slice(source.indexOf("const editorNavigation=["), source.indexOf("const scoreFields="));
  let previous = -1;
  for (const id of ids) {
    const marker = '<AdminEditorSection id="breed-' + id + '"';
    const current = source.indexOf(marker);
    assert.ok(current > previous, "Out-of-order or missing editor section: " + id);
    previous = current;
    assert.ok(nav.includes('{id:"breed-' + id + '"'), "Missing nav item " + id);
  }
  assert.equal((source.match(/<AdminEditorSection id="breed-/g) ?? []).length, 9);
  assert.match(source, /sectionMode="switch"/);
  assert.match(source, /activeSectionId=\{activeBreedSection\}/);
  assert.match(source, /onSectionChange=\{setActiveBreedSection\}/);
  assert.match(workspace, /sectionMode = "scroll"/);
  assert.match(workspace, /sectionMode === "switch"/);
  assert.match(workspace, /<AdminEditorSectionVisibility\.Provider/);
  assert.match(section, /useContext\(AdminEditorSectionVisibility\)/);
  assert.match(section, /hidden=\{hidden\}/);
  assert.match(visibility, /createContext/);
});

test("all critical values and saves remain supported after repositioning", () => {
  const source = read("components/admin-breed-editor.tsx");
  for (const field of [
    "fciNumber", "fciStandard", "editorial", "sports",
    "relatedBreedIds", "relatedArticleIds", "directoryProfileIds",
    "sources", "gallery", "seo", "expectedUpdatedAt",
  ]) assert.match(source, new RegExp("\\b" + field + "\\b"), field);
  assert.match(source, /<form id="breed-canonical-editor-form"[^>]*noValidate/);
  assert.match(source, /if \(!form\.name\.trim\(\)\)/);
  assert.match(source, /chooseBreedSection\("breed-overview"\)/);
  assert.match(source, /chooseBreedSection\("breed-settings"\)/);
  assert.match(source, /method:breed\?"PUT":"POST"/);
  assert.match(source, /body:JSON\.stringify\(\{\.\.\.form,/);
  assert.match(source, /setExpectedUpdatedAt\(data\.breed\.updatedAt\)/);
  assert.match(source, /saveBreed|\/controlled/);
  assert.match(source, /<AdminSortableGallery/);
  assert.match(source, /<AdminDrawer/);
  assert.match(source, /<AdminGalleryDropzone/);
  assert.match(source, /<AdminNotionProfileImportButton/);
  assert.doesNotMatch(source, /<AdminBreedRelationGroup|<AdminBreedNotionExtras/);
  assert.equal((source.match(/value=\{form\.goodFor\}/g) ?? []).length, 1);
  assert.equal((source.match(/value=\{form\.consider\}/g) ?? []).length, 1);
});

test("breed Admin CSS uses touch-safe compact fields on desktop and mobile", () => {
  const css = read("components/admin-breed-editor.module.css");
  assert.match(css, /Breed Admin v6/);
  assert.match(css, /\.fitEditGrid/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /\.measureGroups/);
});
