import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_DUP_SIGNALS, scanAdminUiSource, collectAdminUiDuplicationInventory } from "../scripts/admin-ui-duplication-inventory.mjs";

test("read-only classifier identifies both shared and local UI primitives with line numbers", () => {
  const source = [
    "export function Demo(){",
    "  if(window.confirm('Potvrdiť?')) return;",
    "  return <><button type=\"button\">A</button><AdminActionButton>B</AdminActionButton>",
    "    <nav aria-label=\"Stránkovanie\"><a>1</a></nav>",
    "    <AdminPagination />",
    "    <input type=\"file\" />",
    "    <AdminModalDialog /></>;",
    "}",
  ].join("\n");
  const found = scanAdminUiSource("components/admin-demo.tsx", source);
  for (const name of ["nativeConfirm", "rawActionButton", "sharedActionButton", "localPagination", "sharedPagination", "nativeFileInput", "sharedModal"]) {
    assert.equal(found.signals[name].count, 1, name);
  }
  assert.deepEqual(found.signals.nativeConfirm.lines, [2]);
  assert.deepEqual(found.signals.nativeFileInput.lines, [6]);
  assert.deepEqual(scanAdminUiSource("components/admin-empty.tsx", "export default null").signals, {});
  assert.ok(!Object.keys(ADMIN_DUP_SIGNALS).includes("automaticDuplicationVerdict"));
});

test("inventory covers all admin-*.tsx components and all app/admin TSX files without modifications", async () => {
  const report = await collectAdminUiDuplicationInventory();
  assert.ok(report.scope.adminComponents > 75);
  assert.ok(report.scope.adminRoutes > 90);
  assert.equal(report.scope.totalFiles, report.scope.adminComponents + report.scope.adminRoutes);
  assert.ok(report.files.every(item => item.path.startsWith("components/admin-") || item.path.startsWith("app/admin/")));
  assert.ok(report.occurrences.rawActionButton > 0);
  assert.ok(report.occurrences.nativeConfirm > 0);
  assert.ok(report.files.some(item => item.path === "components/admin-pagination.tsx") === false ||
    report.files.some(item => item.path === "components/admin-pagination.tsx" && typeof item.signals === "object"));
});
