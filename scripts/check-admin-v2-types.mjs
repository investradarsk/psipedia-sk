/**
 * Baseline-aware TypeScript regression gate for PR #1321.
 * The repository currently has pre-existing project-wide TS errors; this
 * gate does NOT claim a clean tsc run. It fails for newly introduced errors
 * in files changed by the Admin Performance V2 work.
 *
 * Usage: npx tsc --noEmit --pretty false > /tmp/admin-v2-tsc.txt 2>&1 || true
 *        node scripts/check-admin-v2-types.mjs /tmp/admin-v2-tsc.txt
 */
import { readFileSync } from "node:fs";

export const changedPaths = new Set([
  "app/admin/page.tsx",
  "components/admin-article-editor.tsx",
  "components/admin-breed-editor.tsx",
  "components/admin-directory-editor.tsx",
  "components/admin-event-editor.tsx",
  "components/admin-organization-editor.tsx",
  "components/admin-quick-navigation-dialog.tsx",
  "components/admin-shell.tsx",
  "lib/admin-attention-request.ts",
  "lib/admin-gallery-order.ts",
]);

export function parseProjectTypescriptDiagnostics(output) {
  const errors = [...output.matchAll(/^(.+?\.tsx?)\((\d+),(\d+)\): error (TS\d+): ([^\n]+)/gm)]
    .map((match) => ({ path: match[1], line: Number(match[2]), column: Number(match[3]),
      code: match[4], message: match[5] }));
  const scoped = errors.filter(error => changedPaths.has(error.path));
  // Existing invalid HTML attribute in the article editor predates this PR.
  // Allow only this specific known diagnostic; never suppress new TS2322s.
  const knownBaseline = scoped.filter(error =>
    error.path === "components/admin-article-editor.tsx" &&
    error.code === "TS2322" && error.message.includes("defaultOpen"),
  );
  const regressions = scoped.filter(error => !knownBaseline.includes(error));
  return { totalProjectErrors: errors.length, scopedErrors: scoped.length,
    knownBaseline: knownBaseline.length, regressions, source: "tsc --noEmit; scoped to changed files; not a clean project typecheck" };
}

if (process.argv[1]?.endsWith("check-admin-v2-types.mjs")) {
  if (!process.argv[2]) throw new Error("Path to captured TypeScript diagnostic output is required");
  const output = readFileSync(process.argv[2], "utf8");
  const result = parseProjectTypescriptDiagnostics(output);
  if (result.totalProjectErrors === 0 && /error|fatal|npm ERR!/i.test(output)) {
    throw new Error("TypeScript command failed without parseable TS diagnostics: " + output.slice(0, 250));
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.regressions.length) process.exitCode = 1;
}
