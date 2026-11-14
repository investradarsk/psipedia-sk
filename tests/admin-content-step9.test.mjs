import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 9: puppy areas use one page title, retained save guard and compact accordion", () => {
  const page = read("app/admin/steniatka/page.tsx");
  const editor = read("components/admin-puppy-area-editor.tsx");
  const css = read("app/admin/admin-editorial-foundation.css");
  assert.match(page, /title="Šteniatka"/);
  assert.match(editor, /title="Obsah oblastí Šteniatok"\s+hidePageTitle/);
  assert.match(editor, /data-admin-content-module="puppy-areas"/);
  assert.match(editor, /<h2>Oblasti na úpravu<\/h2>/);
  assert.doesNotMatch(editor, /<h2>Obsah oblastí Šteniatok<\/h2>/);
  assert.match(editor, /dirty=\{dirty\}/);
  assert.match(editor, /onClick=\{\(\) => void save\(\)\}/);
  assert.match(editor, /<AdminSingleImageUpload/);
  assert.match(editor, /<AdminLexicalTextField/);
  assert.match(css, /CONTENT UNIFICATION 9\/18/);
  assert.match(css, /\[data-admin-content-module="puppy-areas"\] \.admin-puppy-content-item summary/);
  assert.match(css, /grid-template-columns: 1\.8rem minmax\(0, 1fr\)/);
});

test("step 9: sections editor shares page heading and compact controls without altering hierarchy", () => {
  const page = read("app/admin/sekcie/page.tsx");
  const editor = read("components/admin-section-editor.tsx");
  const css = read("components/admin-section-editor.module.css");
  assert.match(page, /title="Sekcie a podsekcie"/);
  assert.match(editor, /title="Editor sekcií a podsekcií"\s+hidePageTitle/);
  assert.match(editor, /data-admin-content-module="sections"/);
  assert.match(editor, /<AdminSortableOrderPreview/);
  assert.match(editor, /onReorder=\{reorderSections\}/);
  assert.match(editor, /onClick=\{\(\) => void save\(\)\}/);
  assert.match(css, /CONTENT UNIFICATION 9\/18/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.2fr\) minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /\.sectionToggle:focus-visible/);
});

test("step 9: name-day editor has mobile card labels and a closed-by-default import", () => {
  const page = read("app/admin/meniny/page.tsx");
  const ui = read("components/admin-dog-name-day-dashboard.tsx");
  const css = read("components/admin-dog-name-day-dashboard.module.css");
  assert.match(page, /title="Psie meniny"/);
  assert.doesNotMatch(page, /Canonical psie meniny/);
  assert.match(ui, /data-admin-content-module="name-days"/);
  assert.match(ui, /role="search" aria-label="Filtre kalendára"/);
  assert.match(ui, /role="status">Zobrazené: \{filtered\.length\} z \{records\.length\}/);
  for (const column of ["Dátum", "Meno", "Stav", "Zdroj", "Upravené", "Akcie"]) {
    assert.ok(ui.includes('data-label="' + column + '"'), column);
  }
  assert.match(ui, /<details className=\{styles\.importPanel\}/);
  assert.match(ui, /Skontrolovať import/);
  assert.match(ui, /onClick=\{\(\) => runImport\(false\)\}/);
  assert.match(ui, /onClick=\{\(\) => runImport\(true\)\}/);
  assert.match(ui, /disabled=\{importPending \|\| !importPlan \|\| importPlan\.summary\.ERROR > 0\}/);
  assert.match(ui, /<AdminDestructiveConfirmDialog/);
  assert.match(css, /CONTENT UNIFICATION 9\/18/);
  assert.match(css, /\.table td\[data-label\]::before/);
  assert.match(css, /\.tableWrap:focus-visible/);
  assert.match(css, /\.importPanel > summary:focus-visible/);
});

test("step 9: articles, breeds and reviews keep the canonical editors and compact modules", () => {
  const article = read("components/admin-article-editor.tsx");
  const breed = read("components/admin-breed-editor.tsx");
  const reviews = read("components/admin-reviews-hub.tsx");
  const shared = read("components/admin-editor-workspace.tsx");
  assert.match(shared, /hidePageTitle = false/);
  assert.match(article, /<EditorWorkspace/);
  assert.match(article, /<EditorActionBar/);
  assert.match(breed, /<EditorWorkspace/);
  assert.match(breed, /hidePageTitle/);
  assert.match(breed, /<AdminNotionProfileImportButton/);
  assert.match(reviews, /data-admin-content-module="reviews"/);
  assert.match(reviews, /<details className=\{styles\.rules\}/);
  assert.match(reviews, /href="\/admin\/recenzie-profilov"/);
});

test("step 9: content geometry remains admin-only and does not clip page overflow", () => {
  const css = read("app/admin/admin-editorial-foundation.css");
  assert.match(css, /\[data-admin-workspace\] \[data-admin-content-module\]/);
  assert.doesNotMatch(css.slice(css.indexOf("CONTENT UNIFICATION 9/18")), /overflow-x:\s*hidden/);
  assert.match(css, /--admin-ui-control-height/);
  assert.match(css, /--admin-ui-panel-padding/);
});
