import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeUniqueAdminDestinations } from "../lib/admin-quick-navigation-results.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("command palette merges section and D1 results in stable order, deduplicating by destination", () => {
  const sections = [
    { href: "/admin/adopcie", label: "Adopcie", kind: "section" },
    { href: "/admin/plemena", label: "Plemená", kind: "section" },
  ];
  const records = [
    { href: "/admin/adopcie", label: "Duplicate", kind: "record" },
    { href: "/admin/plemena/12", label: "Labrador", kind: "record" },
    { href: "/admin/plemena/12", label: "Duplicate", kind: "record" },
    { href: "/admin/clanky/5", label: "Výchova", kind: "record" },
  ];
  const merged = mergeUniqueAdminDestinations(sections, records);
  assert.deepEqual(merged.map(item => item.href), [
    "/admin/adopcie", "/admin/plemena", "/admin/plemena/12", "/admin/clanky/5",
  ]);
  assert.equal(merged[0], sections[0], "existing sidebar action stays authoritative");
  assert.equal(merged[2], records[1], "first backend result wins duplicate href");
  assert.deepEqual(sections.map(item => item.label), ["Adopcie", "Plemená"]);
  assert.equal(mergeUniqueAdminDestinations([], []).length, 0);
});

test("shared TanStack table does not sort pages already ordered by SQL or rerender on drag", () => {
  const table = read("components/admin-record-table.tsx");
  assert.match(table, /manualSorting: serverSorted \|\| Boolean\(serverSorting\)/);
  assert.match(table, /getSortedRowModel: serverSorted \|\| serverSorting \? undefined : clientSortedRowModel/);
  assert.match(table, /const coreRowModel = useMemo\(\(\) => getCoreRowModel<T>\(\), \[\]\)/);
  assert.match(table, /const clientSortedRowModel = useMemo\(\(\) => getSortedRowModel<T>\(\), \[\]\)/);
  assert.match(table, /columnResizeMode: "onEnd"/);
  assert.match(table, /getRowId: recordRowId/);
  assert.match(table, /onColumnVisibilityChange: setVisibility/);
  assert.match(table, /serverSorting\.onChange\(\{ id: first\.id, desc: first\.desc \}\)/);
  assert.match(table, /selection\.onChange\(rows\.filter/);
});

test("long editors do not reattach intersection observer for each keystroke", () => {
  const editor = read("components/admin-editor-workspace.tsx");
  assert.match(editor, /const sectionIds = sections\.map\(section => section\.id\)\.join/);
  assert.match(editor, /useEffect\(\(\) => \{ onSectionChangeRef\.current = onSectionChange; \}, \[onSectionChange\]\)/);
  assert.match(editor, /\[mode, sectionMode, sectionIds\]/);
  assert.doesNotMatch(editor, /\[mode, sectionMode, sections, onSectionChange\]/);
  assert.match(editor, /observer\.disconnect\(\)/);
  assert.match(editor, /lastObservedSectionRef\.current !== closest\.target\.id/);
  assert.match(editor, /setActiveSection\(previous => previous === id \? previous : id\)/);
  assert.match(editor, /onSectionChangeRef\.current\?\.\(id\)/);
});

test("quick navigation searches only when query changes and preserves abort/debounce", () => {
  const palette = read("components/admin-quick-navigation-dialog.tsx");
  assert.match(palette, /const sectionResults = useMemo\(\(\) => query\.trim\(\)/);
  assert.match(palette, /mergeUniqueAdminDestinations\(/);
  assert.match(palette, /\[sectionResults, records, query\]/);
  assert.match(palette, /signal: controller\.signal/);
  assert.match(palette, /controller\.abort\(\)/);
  assert.match(palette, /SEARCH_DEBOUNCE_MS/);
  assert.match(palette, /cache\.current\.size > SEARCH_CACHE_LIMIT/);
  assert.match(palette, /setActive\(previous => previous === index \? previous : index\)/);
});

test("repeated table review and ID controls are memoized without rewriting their save behavior", () => {
  const review = read("components/admin-review-checkbox.tsx");
  const id = read("components/admin-record-id.tsx");
  assert.match(review, /export const AdminReviewCheckbox = memo\(function AdminReviewCheckbox/);
  assert.match(review, /fetch\("\/api\/admin\/reviews"/);
  assert.match(review, /method: "PATCH"/);
  assert.match(id, /export const AdminRecordId = memo\(function AdminRecordId/);
  assert.match(id, /navigator\.clipboard\.writeText\(String\(id\)\)/);
});
