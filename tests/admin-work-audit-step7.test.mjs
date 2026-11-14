import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Work P2: article toolbar height participates in section scrolling", () => {
  const tiptap = read("components/admin-tiptap-article-editor.tsx");
  const editor = read("components/admin-content-editor-v3.module.css");
  const shared = read("components/admin-shared-editor-navigation.tsx");
  assert.match(tiptap, /closest<HTMLElement>\('\[data-editor-layout="article"\]'\)/);
  assert.match(tiptap, /--admin-tiptap-toolbar-height/);
  assert.match(tiptap, /new ResizeObserver\(update\)/);
  assert.match(tiptap, /observer\.disconnect\(\)/);
  assert.match(editor, /scroll-margin-top: calc\(\s*var\(--admin-sticky-stack, 96px\) \+ var\(--admin-tiptap-toolbar-height, 76px\) \+ 16px/s);
  assert.match(shared, /target\.scrollIntoView\(/);
});

test("Work P2: article filter form has one grouped sort/direction row and a primary submit button", () => {
  const dashboard = read("components/admin-dashboard.tsx");
  const css = read("app/admin/admin-workspace.css");
  const moduleCss = read("components/admin-article-dashboard.module.css");
  assert.match(dashboard, /data-admin-article-filters/);
  assert.match(dashboard, /data-admin-sort-direction/);
  assert.match(dashboard, /<select name="sort"/);
  assert.match(dashboard, /<select name="direction"/);
  assert.match(dashboard, /<button type="submit">Filtrovať<\/button>/);
  assert.match(moduleCss, /\.sortDirectionGroup\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /form\.admin-toolbar\[data-admin-article-filters\] > button\[type="submit"\][\s\S]*?background: var\(--admin-v3-green/);
  assert.match(css, /form\.admin-toolbar\[data-admin-article-filters\] > \.admin-search/);
});

test("Work P2: article table keeps actions visible without changing other grids", () => {
  const grid = read("components/admin-record-table.tsx");
  const article = read("components/admin-dashboard.tsx");
  const css = read("components/admin-record-table.module.css");
  assert.match(grid, /stickyActions = false/);
  assert.match(grid, /data-sticky-actions=\{stickyActions \? "true" : undefined\}/);
  assert.match(grid, /data-column-id=\{header\.column\.id\}/);
  assert.match(article, /\s+stickyActions\s+serverSorted/);
  assert.match(article, /id: "actions", label: "Akcie", width: 215/);
  assert.match(css, /data-sticky-actions="true"/);
  assert.match(css, /position: sticky;\s*right: 0/);
  assert.match(css, /:not\(\[data-mobile-focus="true"\]\)/);
  assert.match(css, /\.scroll \{ width: 100%; overflow-x: auto/);
});

test("Work P3: prioritize actionable dashboard queues and collapse only known zero counts", () => {
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const activity = read("components/admin-workspace-activity.tsx");
  const css = read("components/admin-workspace-dashboard.module.css");
  assert.match(dashboard, /sourceMetric\(attention, source\)\.value !== 0/);
  assert.match(dashboard, /sourceMetric\(attention, source\)\.value === 0/);
  assert.match(dashboard, /data-admin-actionable-queues/);
  assert.match(dashboard, /data-admin-completed-queues/);
  assert.match(dashboard, /<WorkspaceQualityMetric promise=\{qualityPromise\} \/>/);
  assert.match(dashboard, /<QueueLink key=\{source\} title=\{title\} source=\{source\} summary=\{attention\} \/>/);
  assert.doesNotMatch(activity, /href="\/admin\/kvalita"/);
  assert.match(css, /\.completedQueues > summary\s*\{[\s\S]*?min-height: 44px/);
});

test("Work P3: right article rail is read-only; canonical publication fields and actions remain", () => {
  const editor = read("components/admin-article-editor.tsx");
  assert.match(editor, /data-article-publication-summary/);
  assert.doesNotMatch(editor, /id="article-rail-published-at"/);
  assert.match(editor, /id="article-published-at"/);
  assert.match(editor, /onClick=\{\(\) => chooseArticleSection\("article-publish"\)\}/);
  assert.match(editor, /<EditorActionBar/);
  assert.match(editor, /onClick=\{\(\) => void save\("scheduled"\)\}/);
  assert.match(editor, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.match(editor, /<AdminRecordLifecycleActions/);
});
