import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 10: services and directory use one category navigator with accessible tools", () => {
  const nav = read("components/admin-directory-module-nav.tsx");
  const styles = read("components/admin-directory-module-nav.module.css");
  const services = read("app/admin/sluzby-pre-psov/page.tsx");
  const directory = read("app/admin/adresar/page.tsx");
  assert.match(nav, /data-admin-directory-modules/);
  assert.match(nav, /data-admin-directory-categories/);
  assert.match(nav, /aria-current=\{selected === category.slug \? "page" : undefined\}/);
  assert.match(nav, /href=\{"\/admin\/sluzby-pre-psov\?category=" \+ category.slug\}/);
  assert.match(nav, /<details className=\{styles.tools\} data-admin-directory-tools>/);
  assert.match(nav, /href="\/admin\/sluzby-pre-psov\/katalog"/);
  assert.match(nav, /href="\/admin\/adresar\/navrhy"/);
  assert.match(services, /<AdminDirectoryCategoryNav selected=\{filters.category\}/);
  assert.match(directory, /<AdminDirectoryCategoryNav selected=\{filters.category\}/);
  assert.match(styles, /\.categories a\s*\{[^}]*min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.categories \{[^}]*overflow-x: auto;/);
  assert.match(styles, /\.tools > summary\s*\{[^}]*min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 10: directory listing retains GET filters, inline editing and archive confirmation", () => {
  const list = read("components/admin-directory-dashboard.tsx");
  const styles = read("components/admin-directory-dashboard.module.css");
  assert.match(list, /data-admin-directory-overview/);
  assert.match(list, /data-admin-directory-list/);
  assert.match(list, /action=\{basePath\} method="get" role="search" data-admin-list-filters/);
  assert.match(list, /data-admin-list-advanced/);
  assert.match(list, /data-admin-list-results/);
  assert.match(list, /<AdminRecordTable/);
  assert.match(list, /<AdminInlineRowActions/);
  assert.match(list, /<AdminDirectoryEditorLink/);
  assert.match(list, /<AdminPagination pagination=\{pagination\}/);
  assert.match(list, /<AdminDestructiveConfirmDialog/);
  assert.match(styles, /\.tableActions :is\(a, button\)\s*\{[^}]*min-height: 44px;/);
  assert.match(styles, /\.reviewToggle \{ min-height: var\(--admin-ui-control-height, 44px\); \}/);
});

test("step 10: one primary published profile save, secondary Notion/SEO tools and existing sync", () => {
  const editor = read("components/admin-directory-editor.tsx");
  const styles = read("components/admin-directory-editor.module.css");
  assert.match(editor, /data-admin-directory-editor/);
  assert.match(editor, /data-admin-form-system="v4"/);
  assert.match(editor, /<AdminSharedEditorNavigation/);
  assert.match(editor, /mode="switch"/);
  assert.match(editor, /<details className=\{styles.secondaryTools\} data-admin-directory-secondary-tools>/);
  assert.match(editor, /<AdminNotionProfileImportButton scope="directory"/);
  assert.match(editor, /onClick=\{\(\) => setAdvancedOpen\(true\)\}>Pokročilé a SEO/);
  assert.match(editor, /\(notionDraft \|\| status !== "published"\) && <AdminActionButton variant="neutral" type="submit"/);
  assert.match(editor, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.doesNotMatch(editor, /Uložiť bez zmeny publikovania/);
  assert.match(editor, /<AdminRecordLifecycleActions kind="directory"/);
  assert.match(editor, /<EditorUnsavedChangesGuard/);
  assert.match(editor, /action: "set-category-filters"/);
  assert.match(styles, /\.editorTopline\s*\{[^}]*position: relative;[^}]*top: auto;/);
  assert.match(styles, /\.secondaryTools > summary\s*\{[^}]*min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 10: canonical Services V3 catalog keeps virtualized list and actual controls", () => {
  const catalog = read("components/admin-service-catalog-workspace.tsx");
  const styles = read("components/admin-service-catalog.module.css");
  assert.match(catalog, /data-admin-directory-catalog/);
  assert.match(catalog, /role="search" aria-label="Filtrovať katalóg služieb" data-admin-list-filters/);
  assert.match(catalog, /data-admin-list-advanced/);
  assert.match(catalog, /data-admin-list-results/);
  assert.match(catalog, /useVirtualizer/);
  assert.match(catalog, /virtualizer\.getVirtualItems\(/);
  assert.match(catalog, /<AdminInlineRowActions/);
  assert.match(catalog, /<AdminDestructiveConfirmDialog/);
  assert.match(styles, /ADMIN CONTENT STEP 10/);
  assert.match(styles, /\.filterBar :is\(input, select\)\s*\{[^}]*min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.doesNotMatch(styles.slice(styles.indexOf("ADMIN CONTENT STEP 10")), /overflow-x:\s*hidden/);
});
