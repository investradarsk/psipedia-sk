import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("e-shop uses the canonical page editor, visible status, guarded leave and live preview", () => {
  const ui = read("components/admin-eshop-editor.tsx");
  assert.match(ui, /<EditorWorkspace\s+mode="page"/);
  assert.match(ui, /<EditorActionBar/);
  assert.match(ui, /<EditorStatus/);
  assert.match(ui, /dirty=\{dirty\}/);
  assert.match(ui, /setSavedSignature\(JSON\.stringify/);
  assert.match(ui, /window\.confirm\("Zahodiť neuložené zmeny e-shopu/);
  assert.match(ui, /previewTitle="Živý náhľad e-shopu"/);
  assert.match(ui, /<fieldset className=\{styles\.fields\} disabled=\{saving\}>/);
  for (const section of ["eshop-basics", "eshop-tags", "eshop-images", "eshop-publication"]) {
    assert.match(ui, new RegExp('<section id="' + section + '" data-admin-editor-section tabIndex=\\{-1\\}'));
  }
  // UI unification must not change the established payload or upload destination.
  assert.match(ui, /fetch\(\x60\/api\/admin\/eshops\/\$\{shop\.id\}\x60/);
  assert.match(ui, /uploadAdminImage\(file, "eshops"\)/);
  assert.match(ui, /focusTags: tagsFromText\(focusTags\)/);
});

test("directory does not demote published profiles and confirms category facet loss", () => {
  const ui = read("components/admin-directory-editor.tsx");
  assert.match(ui, /save\(status === "published" && !notionDraft \? "published" : "draft"\)/);
  assert.match(ui, /Zmenou kategórie zahodíš neuložené kategóriové filtre/);
  assert.match(ui, /setFormDirty\(true\)/);
  assert.match(ui, /<EditorUnsavedChangesGuard active=\{formDirty\}/);
  assert.match(ui, /<EditorStatus label=\{status === "published"/);
  assert.match(ui, /Uložiť bez zmeny publikovania/);
  assert.match(ui, /DirectoryAddressAutocomplete/);
  assert.match(ui, /DirectoryCategoryFilterFields/);
  assert.match(ui, /<AdminSeoFields/);
  assert.match(ui, /setFormDirty\(false\)/);
});

test("Services V3 keeps versioned profile writes and uses shared statuses/actions", () => {
  const ui = read("components/admin-service-profile-values.tsx");
  assert.match(ui, /<EditorActionBar message=\{message\}/);
  assert.match(ui, /<EditorStatus/);
  assert.match(ui, /<EditorUnsavedChangesGuard active=\{changed.length>0\}/);
  assert.match(ui, /method:"PATCH"/);
  assert.match(ui, /expectedVersion:saved\[item\.id\]\?\.version\?\?0/);
  assert.match(ui, /selectionForEditor\(saved/);
  assert.match(ui, /"Neznáme"/);
  const catalog = read("components/admin-service-catalog-workspace.tsx");
  assert.match(catalog, /<EditorWorkspace mode="modal"/);
  assert.match(catalog, /<EditorActionBar/);
});

test("scoped responsive styles address narrow 390/320 profiles without global CSS edits", () => {
  const eshop = read("components/admin-eshop-editor.module.css");
  const directory = read("components/admin-directory-editor.module.css");
  const services = read("components/admin-service-catalog.module.css");
  assert.match(eshop, /@media \(max-width: 390px\)/);
  assert.match(directory, /@media \(max-width: 390px\)/);
  assert.match(services, /@media \(max-width: 390px\)/);
  assert.match(eshop, /\.uploadButton:focus-within/);
  assert.match(services, /safe-area-inset-bottom/);
});
