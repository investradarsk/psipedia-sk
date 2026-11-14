import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const dashboards = [
  ["help-list", "components/admin-help-dashboard.tsx"],
  ["adoptions-list", "components/admin-adoption-dashboard.tsx"],
  ["lost-found-list", "components/admin-lost-found-dashboard.tsx"],
  ["organizations-list", "components/admin-organization-publication-dashboard.tsx"],
];
const editors = [
  ["help-editor", "components/admin-help-editor.tsx"],
  ["adoptions-editor", "components/admin-adoption-editor.tsx"],
  ["lost-found-editor", "components/admin-lost-found-editor.tsx"],
  ["organizations-editor", "components/admin-organization-editor.tsx"],
];

test("step 12: four lists preserve original search, table selection and visible actions", () => {
  for (const [id, path] of dashboards) {
    const src = read(path);
    assert.ok(src.includes('data-admin-content-module="' + id + '"'), path);
    assert.match(src, /data-admin-list-filters/, path);
    assert.match(src, /role="search"/, path);
    assert.match(src, /<AdminRecordTable\s+stickyActions|<AdminRecordTable[\s\S]*?stickyActions/, path);
    assert.match(src, /<AdminInlineRowActions|<AdminRecordBulkDelete/, path);
  }
  const help = read(dashboards[0][1]);
  const adoptions = read(dashboards[1][1]);
  const lostFound = read(dashboards[2][1]);
  const org = read(dashboards[3][1]);
  assert.match(help, /<AdminDestructiveConfirmDialog/);
  assert.match(help, /data-admin-help-list/);
  assert.match(adoptions, /<AdminNumberedPagination/);
  assert.match(lostFound, /<AdminNumberedPagination/);
  assert.match(org, /<AdminPagination pagination=\{data\.pagination\}/);
  assert.match(org, /<AdminModalDialog/);
});

test("step 12: four editors keep dirty guards, navigation, upload, footer and lifecycle", () => {
  for (const [id, path] of editors) {
    const src = read(path);
    assert.ok(src.includes('data-admin-content-module="' + id + '"'), path);
    assert.match(src, /<AdminSharedEditorNavigation/, path);
    assert.match(src, /<EditorUnsavedChangesGuard/, path);
    assert.match(src, /<AdminEditorFooter/, path);
    assert.match(src, /<AdminRecordLifecycleActions/, path);
    if (id === "adoptions-editor") {
      assert.match(src, /<AdminAdoptionEditorDetails/, path);
      assert.match(read("components/admin-adoption-editor-details.tsx"), /<AdminSingleImageUpload/);
    } else {
      assert.match(src, /<AdminSingleImageUpload/, path);
    }
    assert.match(src, /data-admin-editor-pager/, path);
    assert.match(src, /data-admin-form-system="v4"/, path);
  }
  assert.match(read("components/admin-lost-found-editor.tsx"), /<AdminPhotoGallery/);
  assert.match(read("components/admin-adoption-editor.tsx"), /expectedUpdatedAt: version/);
  assert.match(read("components/admin-organization-editor.tsx"), /<AdminOrganizationLocations/);
});

test("step 12: user-facing labels are Slovak while canonical status values stay unchanged", () => {
  const lost = read("components/admin-lost-found-editor.tsx");
  const lostList = read("components/admin-lost-found-dashboard.tsx");
  const org = read("components/admin-organization-editor.tsx");
  assert.match(lost, /<option value="LOST">Stratený pes<\/option>/);
  assert.match(lost, /<option value="FOUND">Nájdený pes<\/option>/);
  assert.match(lostList, /<option value="">Všetky hlásenia<\/option>/);
  assert.match(org, /<label htmlFor="organization-status">Stav publikovania<\/label>/);
  assert.match(org, /Overenie údajov a publikovanie sú dva nezávislé stavy/);
  assert.doesNotMatch(org, /Verification a publication sú oddelené semantics/);
  assert.doesNotMatch(org, /Iba public organization fields/);
  assert.match(lost, /data-public-lost-found-contacts/);
});

test("step 12: shared layout remains scoped and mobile inputs retain 16px and 44px actions", () => {
  for (const path of [
    "components/admin-help-bulk.module.css",
    "components/admin-lost-found.module.css",
    "components/admin-organization-publication.module.css",
    "components/admin-adoption-editor.module.css",
    "components/admin-organization-editor.module.css",
  ]) {
    const css = read(path);
    assert.match(css, /ADMIN CONTENT STEP 12/, path);
    assert.match(css, /44px/, path);
    assert.match(css, /@media\s*\(max-width:/, path);
    assert.doesNotMatch(css.slice(css.indexOf("ADMIN CONTENT STEP 12")), /(?:html|body)\s*\{[\s\S]*?overflow-x:\s*hidden/, path);
  }
  for (const path of [
    "components/admin-help-bulk.module.css",
    "components/admin-lost-found.module.css",
    "components/admin-organization-editor.module.css",
    "components/admin-adoption-editor.module.css",
  ]) assert.match(read(path), /font-size:16px/, path);
});
