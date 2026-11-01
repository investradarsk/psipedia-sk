import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared TanStack table supports page-scoped, accessible and controlled row selection", () => {
  const table = source("components/admin-record-table.tsx");
  assert.match(table, /type RowSelectionState/);
  assert.match(table, /selectedIds: readonly number\[\]/);
  assert.match(table, /onRowSelectionChange:/);
  assert.match(table, /getIsAllPageRowsSelected\(\)/);
  assert.match(table, /getIsSomePageRowsSelected\(\)/);
  assert.match(table, /toggleAllPageRowsSelected\(checked\)/);
  assert.match(table, /row\.toggleSelected\(checked\)/);
  assert.match(table, /visibleIds\.has\(id\)/);
  assert.match(table, /rows\.filter\(record => next\[String\(record\.id\)\]\)/);
  assert.match(table, /getRowId: \(record\) => String\(record\.id\)/);
  assert.match(table, /!busy && !selection\?\.disabled/);
  assert.doesNotMatch(table, /fetch\(/);
});

test("unified Help table requires a reviewed preflight and cannot spill across pages or domains", () => {
  const table = source("components/admin-help-unified-table.tsx");
  assert.match(table, /isHelpAdminCreateCategory\(category\)/);
  assert.match(table, /const viewKey = JSON\.stringify/);
  assert.match(table, /selectionState\.key === viewKey/);
  assert.match(table, /visibleIds\.has\(id\)/);
  assert.match(table, /expectedCategory: category/);
  assert.match(table, /"\/api\/admin\/help\/bulk"/);
  assert.match(table, /action: "preflight"/);
  assert.match(table, /action: "apply"/);
  assert.match(table, /confirmedCount: preview\.items\.length/);
  assert.match(table, /<AdminModalDialog/);
  assert.match(table, /router\.refresh\(\)/);
  assert.match(table, /!canBulkEdit && rows\.length > 0/);
  assert.doesNotMatch(table, /api\/admin\/adoptions\/bulk|api\/admin\/lost-found\/bulk/);

  const api = source("app/api/admin/help/bulk/route.ts");
  assert.match(api, /getAdminApiUser\(\)/);
  assert.match(api, /request\.headers\.get\("origin"\) !== new URL\(request\.url\)\.origin/);
  assert.match(api, /preflightManagedHelpBulk/);
  assert.match(api, /applyManagedHelpBulk/);

  const validator = source("lib/admin-help-bulk.ts");
  assert.match(validator, /isHelpAdminCreateCategory\(input\.expectedCategory\)/);
  assert.match(validator, /rows\.some\(row => row\.category !== input\.expectedCategory\)/);
  assert.match(validator, /helpAdminDomainSql\(\)/);
  assert.match(validator, /bulkHelpStatusSql/);
});
