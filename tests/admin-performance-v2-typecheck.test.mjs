import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectTypescriptDiagnostics, changedPaths } from "../scripts/check-admin-v2-types.mjs";

test("phase2 typecheck admits only the one documented legacy HTML details diagnostic", () => {
  const log = [
    "components/admin-article-editor.tsx(706,95): error TS2322: Type '{ defaultOpen: boolean; }' is not assignable to type 'DetailedHTMLProps'.",
    "worker/index.ts(15,41): error TS5097: An import path can only end with .ts.",
    "components/admin-shell.tsx(42,38): error TS2552: Cannot find name oldImport.",
  ].join("\n");
  const result = parseProjectTypescriptDiagnostics(log);
  assert.equal(result.totalProjectErrors, 3);
  assert.equal(result.scopedErrors, 2);
  assert.equal(result.knownBaseline, 1);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].path, "components/admin-shell.tsx");
});

test("no new errors in changed files passes despite legacy errors elsewhere", () => {
  const log = "worker/index.ts(15,41): error TS5097: Known baseline.\n";
  const result = parseProjectTypescriptDiagnostics(log);
  assert.equal(result.regressions.length, 0);
  assert.ok(changedPaths.has("lib/admin-gallery-order.ts"));
});
