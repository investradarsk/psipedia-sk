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

test("Partner E2E confirms every moderation action with shared in-page dialogs", () => {
  const e2e = read("tests/e2e/partner-auth.spec.ts");
  const admin = e2e.slice(e2e.indexOf('test("internal admin Partner overview'), e2e.indexOf('for (const token of [', e2e.indexOf('test("internal admin Partner overview')));
  for (const label of ["Schváliť a publikovať profil?", "Overiť správcu profilu?", "Schváliť správu záznamu?"]) {
    assert.ok(admin.includes('getByRole("dialog",{name:"' + label + '"})'), label);
  }
  // A new canonical draft cannot be linked to an unrelated existing profile.
  // Legacy no-subject-id proposals retain a separately confirmed link action.
  assert.match(admin, /getByRole\("button",\{name:"Prepojiť tento profil"\}\)\.toHaveCount\(0\)/);
  assert.match(read("components/admin-partner-new-profile-actions.tsx"), /title="Prepojiť tento profil\?"/);
  assert.match(read("app/admin/partners/submissions/[id]/page.tsx"), /submission\.active&&!submission\.subjectId/);
  assert.match(admin, /await createDialog\.getByRole\("button",\{name:"Zrušiť"\}\)\.click\(\)/);
  // The Partner Events editor now uses the same safe modal as other admin actions.
  // Confirm that neither event action still accepts a native browser confirmation.
  assert.equal((admin.match(/page\.once\("dialog"/g) ?? []).length, 0);
  assert.match(admin, /getByRole\("dialog",\{name:"Potvrdiť partnerské rozhodnutie"\}\)/);
  assert.match(admin, /createEventDialog\.getByRole\("button",\{name:"Zrušiť"\}\)\.click\(\)/);
  assert.match(admin, /createEventDialog\.getByRole\("button",\{name:"Potvrdiť"\}\)\.click\(\)/);
  // Existing OWNER records save directly: neither profile nor event updates
  // should create an Admin moderation action in this E2E journey.
  assert.match(admin, /await expect\(updateEventRow\)\.toHaveCount\(0\)/);
  assert.match(admin, /await expect\(changeRow\)\.toHaveCount\(0\)/);
  assert.match(read("components/admin-partner-event-actions.tsx"), /<AdminDestructiveConfirmDialog/);
  assert.doesNotMatch(read("components/admin-partner-event-actions.tsx"), /window\.confirm/);
});
