import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyChangedFiles } from "./ci-scope.mjs";

const workflowDir = ".github/workflows";
const workflowFiles = readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort();
const workflows = new Map(workflowFiles.map((name) => [name, readFileSync(join(workflowDir, name), "utf8")]));

function onBlock(source) {
  const start = source.indexOf("\non:\n") >= 0 ? source.indexOf("\non:\n") + 1 : source.indexOf("on:\n");
  if (start < 0) return "";
  const candidates = ["\npermissions:", "\nconcurrency:", "\njobs:"]
    .map((token) => source.indexOf(token, start + 1))
    .filter((index) => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const required = workflows.get("playwright-e2e.yml");
assert.ok(required, "playwright-e2e.yml must exist");
assert.match(required, /name:\s*Build, lint and unit\/integration tests/);
assert.match(required, /name:\s*Breed CI bootstrap, all-breed regression and Playwright/);
assert.match(onBlock(required), /\n  pull_request:/, "required workflow must always receive pull_request");
assert.doesNotMatch(onBlock(required), /\n    paths(?:-ignore)?:/, "required workflow must not use top-level PR path filtering");
assert.match(required, /node scripts\/ci-scope\.mjs --github-output/);
assert.match(required, /node scripts\/check-ci-scope\.mjs/);

const expensiveSignature = /(?:npm ci|npm run build|playwright install|db:validate-clean)/;
for (const [name, source] of workflows) {
  const trigger = onBlock(source);
  const isPr = /\n  pull_request:/.test(trigger);
  if (!isPr || !expensiveSignature.test(source)) continue;

  const hasPathScope = /\n    paths(?:-ignore)?:/.test(trigger);
  const hasInternalScope = /scripts\/ci-scope\.mjs --github-output/.test(source);
  assert.ok(hasPathScope || hasInternalScope, `${name}: expensive PR workflow needs paths or internal changed-file scope`);

  assert.match(source, /\nconcurrency:/, `${name}: PR workflow needs concurrency`);
  const cancel = source.match(/cancel-in-progress:\s*(.+)/)?.[1]?.trim() ?? "";
  assert.ok(cancel && cancel !== "false", `${name}: PR concurrency must cancel stale runs`);
}

for (const name of ["clean-d1-migration-validation.yml","map-geo-foundation-ci.yml","map-read-api-ci.yml","map-public-ui-ci.yml","map-production-launch-ci.yml","notion-events-help-sync-ci.yml"]) {
  const source = workflows.get(name);
  assert.ok(source, `${name} missing`);
  assert.doesNotMatch(onBlock(source), /"package\.json"/, `${name}: package.json must not be a blanket feature trigger`);
  assert.match(onBlock(source), /"package-lock\.json"/, `${name}: dependency lock changes must remain in scope`);
}

for (const name of ["section-hero-v2-ci.yml", "unified-section-hero-ci.yml"]) {
  const source = workflows.get(name);
  assert.ok(source);
  const trigger = onBlock(source);
  assert.doesNotMatch(trigger, /- "app\/\*\*"/);
  assert.doesNotMatch(trigger, /- "components\/\*\*"/);
  assert.doesNotMatch(trigger, /- "lib\/\*\*"/);
}

const productionContracts = {
  "playwright-e2e.yml": ["push:", "schedule:", "workflow_dispatch:"],
  "map-production-live-audit.yml": ["push:", "workflow_dispatch:"],
  "map-production-readiness.yml": ["workflow_dispatch:"],
  "production-d1-migrate.yml": ["workflow_dispatch:"],
  "production-d1-backlog.yml": ["workflow_dispatch:"],
  "production-d1-backlog-verify.yml": ["workflow_dispatch:"],
  "production-d1-history-audit.yml": ["workflow_dispatch:"],
  "auto-update-automerge-prs.yml": ["push:", "workflow_dispatch:"],
};
for (const [name, events] of Object.entries(productionContracts)) {
  const source = workflows.get(name);
  assert.ok(source, `${name} missing`);
  const trigger = onBlock(source);
  for (const event of events) assert.ok(trigger.includes(event), `${name}: lost ${event} trigger`);
}

const scenarioA = classifyChangedFiles(["app/clanky/[slug]/page.tsx"]);
assert.ok(scenarioA.scopes.includes("ARTICLES"));
assert.ok(!scenarioA.scopes.includes("MAPS") && !scenarioA.scopes.includes("PARTNER") && !scenarioA.scopes.includes("NOTION"));

const scenarioB = classifyChangedFiles(["components/admin-profile-google-maps.tsx"]);
assert.ok(scenarioB.scopes.includes("MAPS") && scenarioB.scopes.includes("ADMIN"));
assert.ok(!scenarioB.scopes.includes("ARTICLES"));

const scenarioC = classifyChangedFiles(["lib/notion-events-help-sync.ts"]);
assert.ok(scenarioC.scopes.includes("NOTION"));
assert.ok(!scenarioC.scopes.includes("DATABASE_MIGRATIONS"));

const scenarioD = classifyChangedFiles(["components/public-visual-system/unified-section-hero.module.css"]);
assert.ok(scenarioD.scopes.includes("VISUAL"));
assert.ok(!scenarioD.scopes.includes("DATABASE_MIGRATIONS"));

const scenarioE = classifyChangedFiles(["drizzle/0108_notion_events_help_bidirectional_sync.sql"]);
assert.ok(scenarioE.scopes.includes("DATABASE_MIGRATIONS"));

const scenarioF = classifyChangedFiles(["package-lock.json"]);
assert.equal(scenarioF.dependency, true);
assert.equal(scenarioF.core, true);

const scenarioG = classifyChangedFiles(["README.md", "docs/ci.md"]);
assert.equal(scenarioG.docsOnly, true);
assert.equal(scenarioG.core, false);
assert.deepEqual(scenarioG.scopes, []);

const scenarioH = classifyChangedFiles([".github/workflows/map-read-api-ci.yml"]);
assert.ok(scenarioH.scopes.includes("MAPS"));
assert.equal(scenarioH.core, true);

const packageScriptOnly = classifyChangedFiles(["package.json"]);
assert.equal(packageScriptOnly.packageMetadataOnly, true);
assert.ok(!packageScriptOnly.scopes.includes("MAPS"));
assert.ok(!packageScriptOnly.scopes.includes("DATABASE_MIGRATIONS"));

const pr579 = classifyChangedFiles([
  ".env.example",
  ".github/workflows/notion-events-help-sync-ci.yml",
  ".github/workflows/production-d1-migrate.yml",
  "app/api/admin/notion-events-help-sync/route.ts",
  "config/runtime-env.ts",
  "drizzle/0108_notion_events_help_bidirectional_sync.sql",
  "lib/notion-bidirectional-reconciliation.ts",
  "lib/notion-bulk-backfill.ts",
  "lib/notion-bulk-sources.ts",
  "lib/notion-canonical-target.ts",
  "lib/notion-events-help-adapters.ts",
  "lib/notion-events-help-sync.ts",
  "package.json",
  "scripts/production-d1-migrate.mjs",
  "worker/index.ts",
  "wrangler.jsonc",
]);
assert.ok(pr579.scopes.includes("NOTION"));
assert.ok(pr579.scopes.includes("DATABASE_MIGRATIONS"));
assert.ok(!pr579.scopes.includes("MAPS"));

const pr580 = classifyChangedFiles([
  ".github/workflows/map-data-row-level-export.yml",
  "app/admin/mapy/page.tsx",
  "app/admin/organizacie/[id]/page.tsx",
  "app/api/admin/geo/[targetType]/[id]/route.ts",
  "components/admin-profile-google-maps.tsx",
  "components/map/public-location-map.tsx",
  "components/organization-profile-detail.tsx",
  "lib/geo-admin-operator.ts",
  "lib/google-place-bulk.ts",
  "lib/map-query.ts",
  "lib/organization-google-maps-workflow.ts",
  "package.json",
  "tests/maps-workflow-simplify-1.test.mjs",
]);
assert.ok(pr580.scopes.includes("MAPS"));
assert.ok(pr580.scopes.includes("ADMIN"));
assert.ok(pr580.scopes.includes("ORGANIZATION_PROFILES"));
assert.ok(!pr580.scopes.includes("NOTION"));
assert.ok(!pr580.scopes.includes("DATABASE_MIGRATIONS"));

console.log(`CI scope guard OK: ${workflowFiles.length} workflows, required checks stable, scenarios A-H pass.`);
