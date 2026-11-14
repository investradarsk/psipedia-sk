import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 11: events dashboard retains query cache, server sorting, pagination and bulk controls", () => {
  const src = read("components/admin-event-dashboard.tsx");
  assert.match(src, /data-admin-content-module="events-list"/);
  assert.match(src, /data-admin-event-list/);
  assert.match(src, /role="search" aria-label="Filtrovať podujatia"/);
  assert.match(src, /data-admin-list-filters/);
  assert.match(src, /data-admin-list-advanced/);
  assert.match(src, /data-admin-list-results/);
  assert.match(src, /<AdminRecordTable[\s\S]*?stickyActions/);
  assert.match(src, /queryKey: \["admin", "events", effectiveFilters, page, today\]/);
  assert.match(src, /fetchAdminEventPage\(effectiveFilters, page, signal\)/);
  assert.match(src, /serverSorted/);
  assert.match(src, /onChange: next =>/);
  assert.match(src, /<AdminInlineRowActions/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /data-admin-list-pagination/);
  assert.match(src, /setPage\(currentPage \+ 1\)/);
});

test("step 11: editor has one page title and keeps saving, Notion, lifecycle and preview", () => {
  const src = read("components/admin-event-editor.tsx");
  const page = read("app/admin/podujatia/[id]/page.tsx");
  const newPage = read("app/admin/podujatia/nove/page.tsx");
  assert.match(src, /data-admin-content-module="events-editor"/);
  assert.match(src, /hidePageTitle/);
  assert.match(src, /<EditorWorkspace/);
  assert.match(src, /<EditorActionBar/);
  assert.match(src, /data-admin-event-more-actions/);
  assert.match(src, /<AdminNotionProfileImportButton scope="events"/);
  assert.match(src, /<AdminRecordLifecycleActions kind="events"/);
  assert.match(src, /status === "draft" && <AdminActionButton type="submit" form="event-editor-v3-form"/);
  assert.match(src, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.match(src, /<form id="event-editor-v3-form" noValidate/);
  assert.match(src, /eventChangedAdminFields\(/);
  assert.match(src, /<AdminEventMarkdownEditor/);
  assert.match(src, /<AdminProfileGoogleMaps/);
  assert.match(src, /<AdminEditorSectionVisibility/);
  assert.match(src, /preview=\{liveSummary\}/);
  assert.match(page, /title="Upraviť podujatie"/);
  assert.match(newPage, /title="Pridaj termín do kalendára"/);
});

test("step 11: mobile event controls and secondary actions are compact and accessible", () => {
  const list = read("components/admin-event-dashboard.module.css");
  const editor = read("components/admin-event-editor.module.css");
  assert.match(list, /ADMIN CONTENT STEP 11/);
  assert.match(list, /\.timeFilters :global\(button\)/);
  assert.match(list, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(list, /\.tableActions a\s*\{/);
  assert.match(list, /\.tableActions :is\(a, button\):focus-visible/);
  assert.match(list, /overflow-x: auto/);
  assert.match(editor, /\.moreActions > summary\s*\{/);
  assert.match(editor, /\.moreActionsPanel\s*\{/);
  assert.match(editor, /position: fixed;/);
  assert.match(editor, /right: max\(12px, env\(safe-area-inset-right\)\)/);
  assert.match(editor, /font-size: 16px;/);
  assert.doesNotMatch(editor.slice(editor.indexOf("ADMIN CONTENT STEP 11")), /overflow-x:\s*hidden/);
});

test("step 11: public calendar access is clear; no partial month-only admin calendar is created", () => {
  const page = read("app/admin/podujatia/page.tsx");
  assert.match(page, /title="Podujatia"/);
  assert.match(page, /href="\/podujatia" target="_blank" rel="noreferrer">Verejný kalendár/);
  assert.match(page, /href="\/admin\/podujatia\/nove"/);
  assert.match(page, /<AdminDirectoryModuleNav active="events"/);
  assert.match(page, /<AdminEventDashboard initialPage=\{initialPage\}/);
});
