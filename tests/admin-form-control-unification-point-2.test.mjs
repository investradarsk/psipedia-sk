import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const noNativeConfirm = path => assert.doesNotMatch(read(path), /window\.confirm\s*\(/, path);

test("Help case deletion requires the shared cancellation-first modal before original DELETE", () => {
  const src = read("components/admin-help-dashboard.tsx");
  assert.match(src, /setPendingDelete\(item\)/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /onConfirm=\{\(\) => \{ if \(pendingDelete\) void removeItem\(pendingDelete\); \}\}/);
  assert.match(src, /pending=\{deletingId !== null\}/);
  assert.match(src, /method: "DELETE"/);
  assert.match(src, /\/api\/admin\/help\/\$\{item.id\}/);
  assert.match(src, /setPendingDelete\(null\)/);
  noNativeConfirm("components/admin-help-dashboard.tsx");
});

test("Service catalog reuses existing EditorWorkspace guard and shared form feedback", () => {
  const workspace = read("components/admin-editor-workspace.tsx");
  const catalog = read("components/admin-service-catalog-workspace.tsx");
  assert.match(workspace, /actions\?: ReactNode \| \(\(requestClose: \(\) => void\) => ReactNode\)/);
  assert.match(workspace, /const resolvedActions = typeof actions === "function" \? actions\(requestClose\) : actions/);
  assert.match(workspace, /if \(dirty\) setConfirmClose\(true\)/);
  assert.match(catalog, /actions=\{\(requestClose\)=>\s*<EditorActionBar/);
  assert.match(catalog, /onClick=\{requestClose\}>Zrušiť/);
  assert.match(catalog, /setArchiveCandidate\(selected\)/);
  assert.match(catalog, /<AdminDestructiveConfirmDialog/);
  assert.match(catalog, /onConfirm=\{\(\)=>\{if\(archiveCandidate\)void archive\(archiveCandidate\);\}\}/);
  assert.match(catalog, /AdminFormFeedback/);
  assert.match(catalog, /expectedVersion:item.version/);
  assert.match(catalog, /action:"retire"/);
  noNativeConfirm("components/admin-service-catalog-workspace.tsx");
});

test("Partner event decisions preserve PATCH payload and require explicit confirmation", () => {
  const src = read("components/admin-partner-event-actions.tsx");
  assert.match(src, /setPendingAction\(action\)/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /onConfirm=\{\(\)=>\{if\(pendingAction\)void run\(pendingAction\);\}\}/);
  assert.match(src, /onCancel=\{\(\)=>\{if\(!busy\)setPendingAction\(null\);\}\}/);
  for (const field of ["canonicalId", "applyImage", "reasonCode"]) assert.ok(src.includes(field));
  assert.match(src, /method:"PATCH"/);
  assert.match(src, /AdminFormFeedback/);
  assert.match(src, /AdminActionButton/);
  noNativeConfirm("components/admin-partner-event-actions.tsx");
});

test("Automation review keeps canonical PUT and draft-only lifecycle", () => {
  const src = read("components/admin-automation-finding-review.tsx");
  assert.match(src, /requestReview\("approve-apply"\)/);
  assert.match(src, /requestReview\("reject"\)/);
  assert.match(src, /requestReview\("approve"\)/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /onConfirm=\{\(\)=>\{if\(pendingReview\)void review\(pendingReview.action\);\}\}/);
  assert.match(src, /JSON.stringify\(\{ action, notes, suppressedDays \}\)/);
  assert.match(src, /method: "PUT"/);
  assert.match(src, /automaticky nezverejnilo/);
  assert.match(src, /AdminFormFeedback/);
  noNativeConfirm("components/admin-automation-finding-review.tsx");
});

test("Missing-quality bulk rejection freezes visible identifiers before modal confirmation", () => {
  const src = read("components/admin-missing-quality-dashboard.tsx");
  assert.match(src, /setPendingRejectIds\(shown.map\(p=>p.id\)\)/);
  assert.match(src, /async function rejectVisible\(ids:number\[\]\)/);
  assert.match(src, /onConfirm=\{\(\)=>\{if\(pendingRejectIds\)void rejectVisible\(pendingRejectIds\);\}\}/);
  assert.match(src, /pending=\{bulkBusy\}/);
  assert.match(src, /ids:ids.slice\(from,from\+200\)/);
  assert.match(src, /\/api\/admin\/data-quality\/missing\/bulk/);
  assert.match(src, /AdminFormFeedback/);
  noNativeConfirm("components/admin-missing-quality-dashboard.tsx");
});

test("Quality single-field rejection uses shared confirmation without changing optimistic hashes", () => {
  const src = read("components/admin-data-quality-dashboard.tsx");
  assert.match(src, /setPendingFieldReject\(\{ profileId: profile.id, suggestion \}\)/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /reviewFieldSuggestion\(pendingFieldReject.profileId, pendingFieldReject.suggestion, "reject"\)/);
  assert.match(src, /expectedProposedValueHash: suggestion.proposedValueHash/);
  assert.match(src, /expectedUpdatedAt: suggestion.canonicalUpdatedAt/);
  assert.match(src, /setPendingFieldReject\(null\)/);
  noNativeConfirm("components/admin-data-quality-dashboard.tsx");
});

test("Puppy area feedback reuses the existing live-region priority", () => {
  const src = read("components/admin-puppy-area-editor.tsx");
  assert.match(src, /feedback=\{<AdminFormFeedback/);
  assert.match(src, /error=\{error\}/);
  assert.match(src, /pending=\{saving\}/);
  assert.match(src, /\/api\/admin\/sections/);
  assert.match(src, /method: "PUT"/);
  assert.match(src, /setDirty\(false\)/);
});
