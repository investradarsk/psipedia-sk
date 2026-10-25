import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("organization row lifecycle actions use the shared safe modal", () => {
  const source = read("components/admin-organization-publication-dashboard.tsx");
  assert.match(source, /AdminDestructiveConfirmDialog/);
  assert.match(source, /pendingPublication/);
  assert.match(source, /onClick=\{\(\) => requestPublication\(item, "publish"\)\}/);
  assert.match(source, /onClick=\{\(\) => requestPublication\(item, "unpublish"\)\}/);
  assert.match(source, /onClick=\{\(\) => requestPublication\(item, "archive"\)\}/);
  assert.match(source, /onClick=\{\(\) => requestPublication\(item, "restore"\)\}/);
  assert.match(source, /const pending = pendingPublication/);
  assert.match(source, /if \(!hydrated \|\| !pending \|\| busyId !== null \|\| bulkBusy\) return/);
  assert.match(source, /onCancel=\{\(\) => \{ if \(busyId === null\) setPendingPublication\(null\); \}\}/);
  assert.match(source, /onConfirm=\{\(\) => void changePublication\(\)\}/);
  assert.match(source, /confirmVariant=\{pendingPublication\?\.action === "archive" \|\| pendingPublication\?\.action === "unpublish"/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /body: JSON\.stringify\(\{ action, expectedUpdatedAt: item\.updatedAt \}\)/);
  assert.doesNotMatch(source, /window\.confirm/);
});

test("organization bulk lifecycle keeps selection/version contract and safe cancel focus", () => {
  const src = read("components/admin-organization-publication-dashboard.tsx");
  assert.match(src, /<AdminModalDialog/);
  assert.match(src, /preferExplicitAutofocus/);
  assert.match(src, /data-admin-autofocus="true" disabled=\{!hydrated \|\| bulkBusy\}/);
  assert.match(src, /if \(!hydrated \|\| !bulkAction \|\| !bulkTargets\.length \|\| bulkBusy\) return/);
  assert.match(src, /"\/api\/admin\/organizations\/bulk"/);
  assert.match(src, /items: bulkTargets\.map\(\(item\) => \(\{ id: item\.id, updatedAt: item\.updatedAt \}\)\)/);
  assert.match(src, /supportsAllMatching: false/);
  assert.match(src, /bulkSelection\.clear\(\)/);
});

test("Partner E2E uses browser dialog only where the existing editor still uses native confirmation", () => {
  const e2e = read("tests/e2e/partner-auth.spec.ts");
  const admin = e2e.slice(e2e.indexOf('test("internal admin Partner overview'), e2e.indexOf('for (const token of [', e2e.indexOf('test("internal admin Partner overview')));
  for (const label of ["Vytvoriť nový profil?", "Prepojiť tento profil?", "Schváliť zmeny profilu?", "Overiť správcu profilu?", "Schváliť prevzatie profilu?"]) {
    assert.ok(admin.includes('getByRole("dialog",{name:"' + label + '"})'), label);
  }
  assert.match(admin, /await createDialog\.getByRole\("button",\{name:"Zrušiť"\}\)\.click\(\)/);
  // Only the unchanged Partner Events editor still emits native window.confirm.
  assert.equal((admin.match(/page\.once\("dialog"/g) ?? []).length, 2);
});
