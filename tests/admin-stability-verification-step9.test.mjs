import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

/**
 * Step 9 is explicitly read-only. Parse changed Admin source and run the pure
 * tests; never connect to production D1 or exercise mutation endpoints here.
 */
const paths = [
  "app/admin/adopcie/page.tsx",
  "app/admin/clanky/page.tsx",
  "app/admin/error.tsx",
  "app/admin/layout.tsx",
  "app/admin/operations/page.tsx",
  "app/admin/organizacie/[id]/error.tsx",
  "app/admin/organizacie/[id]/loading.tsx",
  "app/admin/organizacie/[id]/not-found.tsx",
  "app/admin/organizacie/[id]/page.tsx",
  "app/admin/organizacie/page.tsx",
  "app/admin/pomoc-psom/page.tsx",
  "app/admin/recenzie/page.tsx",
  "app/admin/stratene-najdene/page.tsx",
  "components/admin-adoption-dashboard.tsx",
  "components/admin-adoption-editor.tsx",
  "components/admin-article-editor.tsx",
  "components/admin-breed-editor.tsx",
  "components/admin-dashboard.tsx",
  "components/admin-directory-editor.tsx",
  "components/admin-editor-navigation-guard.tsx",
  "components/admin-editor-workspace.tsx",
  "components/admin-eshop-editor.tsx",
  "components/admin-event-editor.tsx",
  "components/admin-gemini-category-prompt-editor.tsx",
  "components/admin-help-editor.tsx",
  "components/admin-lost-found-dashboard.tsx",
  "components/admin-lost-found-editor.tsx",
  "components/admin-mobile-document-navigation.tsx",
  "components/admin-navigation-recovery.tsx",
  "components/admin-navigation.tsx",
  "components/admin-organization-editor.tsx",
  "components/admin-organization-publication-dashboard.tsx",
  "components/admin-organization-suggestions.tsx",
  "components/admin-pwa-registration.tsx",
  "components/admin-quick-navigation-dialog.tsx",
  "components/admin-record-id.tsx",
  "components/admin-record-table.tsx",
  "components/admin-recovery-actions.tsx",
  "components/admin-review-checkbox.tsx",
  "components/admin-service-profile-values.tsx",
  "components/admin-unsaved-form-links.tsx",
  "components/site-header.tsx",
  "instrumentation-client.ts",
  "lib/admin-editor-navigation.ts",
  "lib/admin-navigation-recovery.ts",
  "lib/admin-quick-navigation-results.ts",
  "lib/adoption-admin-store.ts",
  "lib/help-organization-admin-store.ts",
  "lib/lost-found-dog-store.ts",
  "lib/organization-admin-read-state.ts",
  "tests/e2e/admin-editor-navigation-guard.spec.ts",
  "tests/e2e/admin-error-recovery-step8.spec.ts",
  "tests/e2e/admin-mobile-pwa-step7.spec.ts",
  "tests/e2e/admin-stability-navigation.spec.ts",
  "tests/e2e/admin-performance-step9.spec.ts",
];

function read(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("all 8 stages of changed TS/TSX sources are parseable TypeScript", () => {
  for (const path of paths) {
    const file = new URL("../" + path, import.meta.url);
    assert.ok(existsSync(file), path);
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const tree = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, kind);
    assert.deepEqual(
      tree.parseDiagnostics.map(diagnostic => ({
        code: diagnostic.code,
        start: diagnostic.start,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      })),
      [],
      path,
    );
  }
});

test("a single, isolated regression command includes core D1, React, iOS/PWA and error tests", () => {
  const pkg = JSON.parse(read("package.json"));
  const required = [
    "test:admin-d1-step5", "test:admin-react-step6",
    "test:admin-mobile-step7", "test:admin-error-step8",
  ];
  for (const key of required) {
    assert.ok(pkg.scripts[key], "missing npm script " + key);
    assert.ok(pkg.scripts["test:admin-pwa"].includes("npm run " + key), key);
  }
  const cli = pkg.scripts["test:admin-stability-step9"];
  assert.ok(cli.includes("npm run test:admin-pwa"));
  assert.ok(cli.includes("npm run test:admin-editor-source-step9"));
  assert.ok(!/deploy:|db:migrate|migrate:|publish:|delete:/.test(cli), "regression CLI must never mutate production");
});

test("manual SQL benchmark is in-memory only and never claims to represent Cloudflare D1", () => {
  const benchmark = read("scripts/benchmark-admin-step9.mjs");
  assert.match(benchmark, /new DatabaseSync\(":memory:"\)/);
  assert.match(benchmark, /assert\.deepEqual\(newFacetRead\(\), oldFacetRead\(\)/);
  assert.match(benchmark, /assert\.deepEqual\(newAdoptionRead\(\), oldAdoptionRead\(\)/);
  assert.match(benchmark, /synthetic-local-sqlite-not-production-d1/);
  assert.doesNotMatch(benchmark, /https?:\/\//);
  assert.doesNotMatch(benchmark, /cloudflare:workers|fetch\(/);
});

test("Playwright navigation probes stay read-only and attach diagnostic timings", () => {
  const script = read("tests/e2e/admin-performance-step9.spec.ts");
  assert.match(script, /performance\.now\(\)/);
  assert.match(script, /testInfo\.attach\(/);
  assert.match(script, /expect\(page\)\.toHaveURL/);
  assert.doesNotMatch(script, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(script, /\.getByRole\("button", \{ name: "(?:Uložiť|Publikovať|Vymazať)"/);
});

test("the PR's regression workflow is read-only and contains no deploy secrets", () => {
  const workflow = read(".github/workflows/admin-stability-regressions.yml");
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:admin-stability-step9/);
  assert.match(workflow, /npx tsc --noEmit --pretty false/);
  assert.doesNotMatch(workflow, /wrangler deploy|db:migrate|deploy:cloudflare|secrets\./);
});
