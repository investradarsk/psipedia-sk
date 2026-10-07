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

function pullRequestPaths(source) {
  const trigger = onBlock(source);
  if (!/\n  pull_request:/.test(trigger)) return undefined;
  const lines = trigger.split("\n");
  let inPullRequest = false;
  let inPaths = false;
  let sawPaths = false;
  const paths = [];

  for (const line of lines) {
    if (/^  pull_request:/.test(line)) {
      inPullRequest = true;
      inPaths = false;
      continue;
    }
    if (!inPullRequest) continue;
    if (/^  [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) break;
    if (/^    paths:/.test(line)) {
      inPaths = true;
      sawPaths = true;
      continue;
    }
    if (inPaths && /^    [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) {
      inPaths = false;
      continue;
    }
    if (!inPaths) continue;
    const match = line.match(/^\s{6}-\s+(.+?)\s*$/);
    if (!match) continue;
    const value = match[1].replace(/^["']|["']$/g, "");
    paths.push(value);
  }
  return sawPaths ? paths : null;
}

function globToRegExp(glob) {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(pattern + "$");
}

function prWorkflowWouldRun(name, files) {
  const source = workflows.get(name);
  assert.ok(source, `${name} missing`);
  const trigger = onBlock(source);
  if (!/\n  pull_request:/.test(trigger)) return false;
  const paths = pullRequestPaths(source);
  if (paths === null) return true;
  if (!paths?.length) return false;
  return files.some((file) => paths.some((pattern) => globToRegExp(pattern).test(file)));
}

const required = workflows.get("playwright-e2e.yml");
assert.ok(required, "playwright-e2e.yml must exist");
assert.match(required, /name:\s*Build, lint and unit\/integration tests/);
assert.match(required, /name:\s*Breed CI bootstrap, all-breed regression and Playwright/);
assert.match(onBlock(required), /\n  pull_request:/, "required workflow must always receive pull_request");
assert.doesNotMatch(onBlock(required), /\n    paths(?:-ignore)?:/, "required workflow must not use top-level PR path filtering");
assert.match(required, /node scripts\/ci-scope\.mjs --github-output/);
assert.match(required, /node scripts\/check-ci-scope\.mjs/);
assert.match(required, /full_core:\s*\$\{\{\s*steps\.scope\.outputs\.full_core\s*\}\}/);
assert.match(required, /bounded_core:\s*\$\{\{\s*steps\.scope\.outputs\.bounded_core\s*\}\}/);
assert.match(required, /steps\.required-scope\.outputs\.full_core == 'true'/);
assert.match(required, /steps\.required-scope\.outputs\.bounded_core == 'true'/);
assert.match(required, /needs\.pr-scope\.outputs\.full_core == 'true'/, "broad PRs must run full required Playwright");
assert.match(required, /name:\s*Directory PR E2E — desktop and mobile/);
assert.match(required, /needs\.pr-scope\.outputs\.directory == 'true'/);
for (const spec of ["admin-directory-filters.spec.ts", "services-detail-shell.spec.ts", "services-search-layout.spec.ts"]) {
  assert.ok(required.includes(`tests/e2e/${spec}`), `directory PR E2E must execute ${spec}`);
}

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

for (const name of [
  "clean-d1-migration-validation.yml",
  "map-geo-foundation-ci.yml",
  "map-read-api-ci.yml",
  "map-public-ui-ci.yml",
  "map-production-launch-ci.yml",
  "notion-events-help-sync-ci.yml",
]) {
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

for (const name of ["ai-internal-discovery-click-value-ci.yml", "sitewide-ai-entity-surface-ci.yml"]) {
  const source = workflows.get(name);
  assert.ok(source, `${name} missing`);
  const trigger = onBlock(source);
  for (const blanket of ["app/**", "components/**", "lib/**", "tests/**", "scripts/**"]) {
    assert.ok(!pullRequestPaths(source)?.includes(blanket), `${name}: blanket ${blanket} PR trigger is forbidden`);
  }
  assert.doesNotMatch(trigger, /lib\/data-automation/, `${name}: automation parser changes must not trigger public AI/entity E2E`);
  assert.ok(pullRequestPaths(source)?.includes(`.github/workflows/${name}`), `${name}: workflow edits must self-trigger`);
  assert.match(source, /cancel-in-progress:\s*true/);
}

const automationFoundation = workflows.get("data-automation-ci.yml");
const automationV2 = workflows.get("data-automation-v2-ci.yml");
assert.ok(automationFoundation && automationV2);
assert.ok(!pullRequestPaths(automationFoundation)?.includes("lib/data-automation*.ts"), "foundation must not blanket-trigger on every automation parser");
assert.ok(pullRequestPaths(automationFoundation)?.includes(".github/workflows/data-automation-ci.yml"));
assert.match(automationV2, /name:\s*Detect automation PR scope/);
assert.match(automationV2, /node scripts\/ci-scope\.mjs --github-output/);
assert.match(automationV2, /needs\.scope\.outputs\.automation_broad == 'true'/);
assert.match(automationV2, /needs\.scope\.outputs\.automation_admin_e2e == 'true'/);
assert.match(automationV2, /name:\s*Parser and provider local contracts/);
assert.match(automationV2, /name:\s*Broad AUTOMATION-1 \+ AUTOMATION-2 regression/);
assert.match(automationV2, /name:\s*Source-management admin contracts/);
assert.match(automationV2, /admin-e2e:[\s\S]*if:\s*needs\.scope\.outputs\.automation_admin_e2e == 'true'/);
assert.ok(pullRequestPaths(automationV2)?.includes(".github/workflows/data-automation-v2-ci.yml"));

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

// Scenario A — PR #652-like Tavily/direct-entity parser change.
const scenarioAFiles = [
  "lib/data-automation-direct-content-quality.ts",
  "lib/data-automation-direct-entity.ts",
  "lib/data-automation-tavily-source-scoped.ts",
  "tests/data-automation-direct-entity-identity.test.mjs",
  "tests/data-automation-tavily-source-scoped.test.mjs",
];
const scenarioA = classifyChangedFiles(scenarioAFiles);
assert.ok(scenarioA.scopes.includes("AUTOMATION"));
assert.equal(scenarioA.automationBroad, false);
assert.equal(scenarioA.automationAdminE2e, false);
assert.equal(scenarioA.fullCore, false);
assert.equal(scenarioA.boundedCore, true);
assert.ok(!scenarioA.scopes.includes("AI_DISCOVERY") && !scenarioA.scopes.includes("ENTITY_SURFACES"));
assert.equal(prWorkflowWouldRun("data-automation-v2-ci.yml", scenarioAFiles), true);
assert.equal(prWorkflowWouldRun("data-automation-ci.yml", scenarioAFiles), false);
assert.equal(prWorkflowWouldRun("ai-internal-discovery-click-value-ci.yml", scenarioAFiles), false);
assert.equal(prWorkflowWouldRun("sitewide-ai-entity-surface-ci.yml", scenarioAFiles), false);

// Scenario B — public article/detail change.
const scenarioBFiles = ["components/article-detail.tsx"];
const scenarioB = classifyChangedFiles(scenarioBFiles);
assert.ok(scenarioB.scopes.includes("ARTICLES"));
assert.ok(scenarioB.scopes.includes("AI_DISCOVERY"));
assert.ok(scenarioB.scopes.includes("ENTITY_SURFACES"));
assert.ok(!scenarioB.scopes.includes("AUTOMATION") && !scenarioB.scopes.includes("MAPS"));
assert.equal(prWorkflowWouldRun("article-ux-ci.yml", scenarioBFiles), true);
assert.equal(prWorkflowWouldRun("data-automation-v2-ci.yml", scenarioBFiles), false);

// Scenario C — admin article editor change.
const scenarioCFiles = ["components/admin-article-editor.tsx"];
const scenarioC = classifyChangedFiles(scenarioCFiles);
assert.ok(scenarioC.scopes.includes("ADMIN") && scenarioC.scopes.includes("ARTICLES"));
assert.ok(!scenarioC.scopes.includes("ENTITY_SURFACES") && !scenarioC.scopes.includes("AI_DISCOVERY"));
assert.equal(prWorkflowWouldRun("article-admin-ci.yml", scenarioCFiles), true);
assert.equal(prWorkflowWouldRun("sitewide-ai-entity-surface-ci.yml", scenarioCFiles), false);

// Scenario D — public breed profile change.
const scenarioDFiles = ["app/plemena/[slug]/page.tsx"];
const scenarioD = classifyChangedFiles(scenarioDFiles);
assert.ok(scenarioD.scopes.includes("BREEDS"));
assert.ok(scenarioD.scopes.includes("AI_DISCOVERY"));
assert.ok(scenarioD.scopes.includes("ENTITY_SURFACES"));
assert.ok(!scenarioD.scopes.includes("AUTOMATION"));
assert.equal(prWorkflowWouldRun("ai-internal-discovery-click-value-ci.yml", scenarioDFiles), true);
assert.equal(prWorkflowWouldRun("sitewide-ai-entity-surface-ci.yml", scenarioDFiles), true);

// Scenario E — directory/shared structured-data change.
const scenarioEFiles = ["lib/directory-profile-schema.ts"];
const scenarioE = classifyChangedFiles(scenarioEFiles);
assert.ok(scenarioE.scopes.includes("DIRECTORY_SERVICES"));
assert.ok(scenarioE.scopes.includes("AI_DISCOVERY"));
assert.ok(scenarioE.scopes.includes("ENTITY_SURFACES"));
assert.equal(prWorkflowWouldRun("ai-internal-discovery-click-value-ci.yml", scenarioEFiles), true);
assert.equal(prWorkflowWouldRun("sitewide-ai-entity-surface-ci.yml", scenarioEFiles), true);

// Scenario F — map-only change.
const scenarioFFiles = ["components/map/public-location-map.tsx"];
const scenarioF = classifyChangedFiles(scenarioFFiles);
assert.ok(scenarioF.scopes.includes("MAPS"));
assert.ok(!scenarioF.scopes.includes("ARTICLES") && !scenarioF.scopes.includes("AUTOMATION"));
assert.ok(!scenarioF.scopes.includes("AI_DISCOVERY") && !scenarioF.scopes.includes("ENTITY_SURFACES"));
assert.equal(prWorkflowWouldRun("map-public-ui-ci.yml", scenarioFFiles), true);
assert.equal(prWorkflowWouldRun("article-ux-ci.yml", scenarioFFiles), false);
assert.equal(prWorkflowWouldRun("data-automation-v2-ci.yml", scenarioFFiles), false);

// Scenario G — migration change must fail closed into broad core.
const scenarioGFiles = ["drizzle/0108_notion_events_help_bidirectional_sync.sql"];
const scenarioG = classifyChangedFiles(scenarioGFiles);
assert.ok(scenarioG.scopes.includes("DATABASE_MIGRATIONS"));
assert.ok(scenarioG.scopes.includes("NOTION"));
assert.equal(scenarioG.fullCore, true);
assert.equal(prWorkflowWouldRun("clean-d1-migration-validation.yml", scenarioGFiles), true);

// Scenario H — dependency lock change must stay broad.
const scenarioH = classifyChangedFiles(["package-lock.json"]);
assert.equal(scenarioH.dependency, true);
assert.equal(scenarioH.fullCore, true);
assert.equal(scenarioH.validationMode, "full");

// Scenario I — shared root/runtime primitive must stay broad.
const scenarioI = classifyChangedFiles(["app/layout.tsx"]);
assert.ok(scenarioI.scopes.includes("SHARED_CORE"));
assert.equal(scenarioI.fullCore, true);
assert.equal(scenarioI.validationMode, "full");

// Scenario J — docs-only keeps required status without install/Playwright.
const scenarioJFiles = ["README.md", "docs/ci.md"];
const scenarioJ = classifyChangedFiles(scenarioJFiles);
assert.equal(scenarioJ.docsOnly, true);
assert.equal(scenarioJ.core, false);
assert.equal(scenarioJ.fullCore, false);
assert.equal(scenarioJ.boundedCore, false);
assert.equal(scenarioJ.validationMode, "fast");
assert.equal(prWorkflowWouldRun("playwright-e2e.yml", scenarioJFiles), true);

// Scenario K — workflow/scoping changes cannot skip the required scope guard.
const scenarioKFiles = [".github/workflows/sitewide-ai-entity-surface-ci.yml", "scripts/ci-scope.mjs"];
const scenarioK = classifyChangedFiles(scenarioKFiles);
assert.equal(scenarioK.ciControl, true);
assert.equal(scenarioK.runtimeChanged, false);
assert.equal(scenarioK.fullCore, false);
assert.equal(scenarioK.boundedCore, false);
assert.equal(scenarioK.validationMode, "ci-control");
assert.equal(prWorkflowWouldRun("playwright-e2e.yml", scenarioKFiles), true);
assert.match(required, /- name:\s*Validate CI scope policy[\s\S]*run:\s*node scripts\/check-ci-scope\.mjs/);

for (const file of [
  "tests/e2e/services-search-layout.spec.ts",
  "tests/e2e/services-detail-shell.spec.ts",
  "tests/e2e/admin-directory-filters.spec.ts",
  "tests/fixtures/directory-admin-e2e.sql",
  "components/directory-filter-form.tsx",
  "components/directory-filter-form.module.css",
  "app/adresar/[category]/page.tsx",
]) {
  const directoryScenario = classifyChangedFiles([file]);
  assert.ok(
    directoryScenario.scopes.includes("DIRECTORY_SERVICES"),
    `${file}: must enable DIRECTORY_SERVICES scope for focused PR E2E`,
  );
}

const packageScriptOnly = classifyChangedFiles(["package.json"]);
assert.equal(packageScriptOnly.packageMetadataOnly, true);
assert.equal(packageScriptOnly.dependency, true);
assert.equal(packageScriptOnly.fullCore, true);
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
assert.ok(pr579.scopes.includes("SHARED_CORE"));
assert.equal(pr579.fullCore, true);
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
assert.ok(pr580.scopes.includes("ENTITY_SURFACES"));
assert.equal(pr580.fullCore, true);
assert.ok(!pr580.scopes.includes("NOTION"));

console.log(
  `CI scope guard OK: ${workflowFiles.length} workflows audited; required checks stable; scenarios A-K and full-coverage contracts pass.`,
);
