import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared confirmation focuses the safe cancel action and supports explicit positive actions", () => {
  const shared = read("components/admin-interaction-system.tsx");
  const confirm = shared.slice(shared.indexOf("export function AdminDestructiveConfirmDialog("), shared.indexOf("export function AdminDrawer("));
  assert.match(confirm, /preferExplicitAutofocus/);
  assert.match(confirm, /variant="neutral" data-admin-autofocus="true" onClick=\{onCancel\}/);
  assert.match(confirm, /variant=\{confirmVariant\}/);
  assert.match(confirm, /confirmVariant\?: "primary" \| "destructive"/);
  assert.match(confirm, /if \(!pending\) onCancel\(\)/);
  assert.doesNotMatch(confirm, /variant="destructive"\s+data-admin-autofocus="true"/);
});

for (const [path, endpoint, positive, note] of [
  ["components/admin-partner-claim-actions.tsx", "/api/admin/partners/claims/", "APPROVE", "decisionNote"],
  ["components/admin-partner-verification-actions.tsx", "/api/admin/partners/verifications/", "VERIFY", "reviewNote"],
]) {
  test(`${path} only submits after safe shared confirmation`, () => {
    const src = read(path);
    assert.match(src, /AdminDestructiveConfirmDialog/);
    assert.match(src, /pendingAction !== null/);
    assert.match(src, /onCancel=\{\(\) => \{ if \(!busy\) setPendingAction\(null\); \}\}/);
    assert.match(src, /onConfirm=\{\(\) => \{ if \(pendingAction\) void run\(pendingAction\); \}\}/);
    assert.match(src, /if \(busy \|\| pendingAction !== action\) return/);
    assert.match(src, /confirmVariant=\{pendingAction ===/);
    assert.match(src, /pending=\{busy\}/);
    assert.match(src, new RegExp(positive));
    assert.match(src, new RegExp(endpoint));
    assert.match(src, new RegExp(note));
    assert.match(src, /method: "PATCH"/);
    assert.match(src, /router\.refresh\(\)/);
    assert.doesNotMatch(src, /window\.confirm|window\.alert/);
  });
}
