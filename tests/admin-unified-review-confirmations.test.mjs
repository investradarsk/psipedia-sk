import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Partner profile changes use safe shared confirmation without changing canonical PATCH", () => {
  const src = read("components/admin-partner-profile-change-actions.tsx");
  assert.match(src, /AdminDestructiveConfirmDialog/);
  assert.match(src, /open=\{pendingAction !== null\}/);
  assert.match(src, /if \(busy \|\| pendingAction !== action\) return/);
  assert.match(src, /confirmVariant=\{pendingAction === "APPROVE" \? "primary" : "destructive"\}/);
  assert.match(src, /onCancel=\{\(\) => \{ if \(!busy\) setPendingAction\(null\); \}\}/);
  assert.match(src, /onConfirm=\{\(\) => \{ if \(pendingAction\) void run\(pendingAction\); \}\}/);
  assert.match(src, /action, reasonCode: action === "REJECT" \? reasonCode : undefined/);
  assert.match(src, /\/api\/admin\/partners\/changes\/\$\{encodeURIComponent\(submissionId\)\}/);
  assert.match(src, /router\.refresh\(\)/);
  assert.doesNotMatch(src, /window\.confirm/);
});

test("new Partner profile resolution snapshots one decision including image and ID", () => {
  const src = read("components/admin-partner-new-profile-actions.tsx");
  assert.match(src, /type ResolutionAction = "CREATE_NEW" \| "LINK_EXISTING" \| "REJECT"/);
  assert.match(src, /setPendingDecision\(\{/);
  assert.match(src, /Number\.isSafeInteger\(linkId\)/);
  assert.match(src, /if \(busy \|\| !decision\) return/);
  assert.match(src, /action: decision\.action/);
  assert.match(src, /canonicalId: decision\.canonicalId, applyImage: decision\.applyImage/);
  assert.match(src, /reasonCode: decision\.reasonCode/);
  assert.match(src, /onConfirm=\{\(\) => void run\(\)\}/);
  assert.match(src, /onCancel=\{\(\) => \{ if \(!busy\) setPendingDecision\(null\); \}\}/);
  assert.match(src, /confirmVariant=\{pendingDecision\?\.action === "REJECT" \? "destructive" : "primary"\}/);
  assert.match(src, /method: "PATCH"/);
  assert.match(src, /router\.refresh\(\)/);
  assert.doesNotMatch(src, /window\.confirm/);
});

test("candidate shortcut uses the shared confirmation but keeps its own payload", () => {
  const src = read("components/admin-partner-new-profile-actions.tsx");
  const candidate = src.slice(src.indexOf("export function AdminPartnerNewProfileCandidateLinkButton("));
  assert.match(candidate, /if\(busy\|\|!confirmOpen\)return/);
  assert.match(candidate, /setConfirmOpen\(true\)/);
  assert.match(candidate, /onCancel=\{\(\) => \{ if \(!busy\) setConfirmOpen\(false\); \}\}/);
  assert.match(candidate, /onConfirm=\{\(\) => void link\(\)\}/);
  assert.match(candidate, /JSON\.stringify\(\{action:"LINK_EXISTING",canonicalId\}\)/);
  assert.doesNotMatch(candidate, /applyImage/);
});

test("Directory proposals confirm review without mutating public profile", () => {
  const src = read("components/admin-directory-change-requests.tsx");
  assert.match(src, /pendingReview/);
  assert.match(src, /if \(!decision \|\| busyId !== null\) return/);
  assert.match(src, /setPendingReview\(\{ item, nextStatus: "approved" \}\)/);
  assert.match(src, /setPendingReview\(\{ item, nextStatus: "rejected" \}\)/);
  assert.match(src, /confirmVariant=\{pendingReview\?\.nextStatus === "approved" \? "primary" : "destructive"\}/);
  assert.match(src, /onCancel=\{\(\) => \{ if \(busyId === null\) setPendingReview\(null\); \}\}/);
  assert.match(src, /onConfirm=\{\(\) => void review\(\)\}/);
  assert.match(src, /method: "PUT"/);
  assert.match(src, /body: JSON\.stringify\(\{ status: nextStatus \}\)/);
  assert.match(src, /Profil sa automaticky nezmení/);
  assert.doesNotMatch(src, /window\.confirm/);
});
