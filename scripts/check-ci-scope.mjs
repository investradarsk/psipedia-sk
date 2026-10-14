import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { evaluateCondition, workflowConditions } from "./ci-scope-conditions.mjs";
import { classifyChangedFiles, focusedPrE2eFlags, isTestScriptOnlyPackageChange, changedPackageTestScriptNames, resolveChangedFiles, productionSmokeRequired } from "./ci-scope.mjs";

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
assert.match(required, /full_core:\s*\$\{\{\s*steps\.required-scope\.outputs\.full_core\s*\}\}/);
assert.match(required, /bounded_core:\s*\$\{\{\s*steps\.required-scope\.outputs\.bounded_core\s*\}\}/);
assert.match(required, /steps\.required-scope\.outputs\.full_core == 'true'/);
assert.match(required, /steps\.required-scope\.outputs\.bounded_core == 'true'/);
assert.match(required, /github\.event_name == 'workflow_dispatch'/, "full E2E must remain manual");
assert.match(required, /github\.event_name == 'schedule'/, "full E2E must remain nightly");
assert.match(required, /name:\s*Directory PR E2E — desktop and mobile/);
assert.match(required, /needs\.validate\.outputs\.directory == 'true'/);
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

// Required full regression and clean D1 are the only lockfile-wide PR validations.
assert.ok(pullRequestPaths(workflows.get("clean-d1-migration-validation.yml"))?.includes("package-lock.json"));
for (const name of [
  "ai-internal-discovery-click-value-ci.yml",
  "ai-referral-measurement-ci.yml",
  "article-ux-ci.yml",
  "content-relations-1.yml",
  "map-geo-foundation-ci.yml",
  "map-production-launch-ci.yml",
  "map-public-ui-ci.yml",
  "map-read-api-ci.yml",
  "notion-article-sync-ci.yml",
  "notion-events-help-sync-ci.yml",
  "organization-profile-e2e.yml",
  "section-hero-v2-ci.yml",
  "sitewide-ai-entity-surface-ci.yml",
  "unified-section-hero-ci.yml"
]) {
  assert.equal(prWorkflowWouldRun(name, ["package-lock.json"]), false, `${name}: unrelated dependency changes must not run costly feature jobs`);
  assert.ok(pullRequestPaths(workflows.get(name))?.includes(`.github/workflows/${name}`), `${name}: workflow must still self-trigger`);
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
  "auto-update-automerge-prs.yml": ["workflow_dispatch:"],
};
for (const [name, events] of Object.entries(productionContracts)) {
  const source = workflows.get(name);
  assert.ok(source, `${name} missing`);
  const trigger = onBlock(source);
  for (const event of events) assert.ok(trigger.includes(event), `${name}: lost ${event} trigger`);
}
// Manual Update branch/auto-merge recovery is intentionally opt-in: never run on main pushes.
assert.doesNotMatch(onBlock(workflows.get("auto-update-automerge-prs.yml")), /\n  push:/, "auto-update helper must not run after every main push");

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

// CI-control changes must validate the scope engine itself without fanning out unrelated feature E2E.
const playwrightControlFiles = [".github/workflows/playwright-e2e.yml", "scripts/ci-scope.mjs", "scripts/check-ci-scope.mjs"];
const playwrightControl = classifyChangedFiles(playwrightControlFiles);
assert.equal(playwrightControl.validationMode, "ci-control");
assert.deepEqual(
  focusedPrE2eFlags(playwrightControl, playwrightControlFiles),
  { adminInteraction: false, adminEvents: false, search: false, directory: false, seoRecovery: false, sitemapDiagnostic: false, lostFound: false },
);

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

// Scenario L — changing only a feature test command is not a dependency update.
// This mirrors PR #750 where the only package.json delta was test:events-public-ux.
const packageBefore = {
  name: "psipedia-sk",
  scripts: { build: "node build.mjs", "test:events-public-ux": "node --test tests/events.test.mjs" },
  dependencies: { next: "16.2.6" },
};
const packageAfter = {
  ...packageBefore,
  scripts: { ...packageBefore.scripts, "test:events-public-ux": "node --test tests/events.test.mjs tests/event-listing.test.mjs" },
};
assert.equal(isTestScriptOnlyPackageChange(packageBefore, packageAfter), true);
assert.deepEqual(changedPackageTestScriptNames(packageBefore, packageAfter), ["test:events-public-ux"]);
const scriptOnly = classifyChangedFiles(["package.json"], { packageTestScriptsOnly: true });
assert.equal(scriptOnly.dependency, false);
assert.equal(scriptOnly.fullCore, false);
assert.equal(scriptOnly.boundedCore, true);
assert.equal(scriptOnly.validationMode, "bounded");
assert.equal(prWorkflowWouldRun("ai-internal-discovery-click-value-ci.yml", ["package.json"]), false);
assert.equal(prWorkflowWouldRun("sitewide-ai-entity-surface-ci.yml", ["package.json"]), false);

// Scenario M — dependencies, build hooks, malformed manifests and locks fail closed.
assert.equal(isTestScriptOnlyPackageChange(packageBefore, {
  ...packageAfter, dependencies: { next: "16.3.0" },
}), false);
assert.equal(isTestScriptOnlyPackageChange(packageBefore, {
  ...packageBefore, scripts: { ...packageBefore.scripts, build: "node different-build.mjs" },
}), false);
assert.equal(isTestScriptOnlyPackageChange(packageBefore, "{not-valid-json"), false);
assert.deepEqual(changedPackageTestScriptNames(packageBefore, "{not-valid-json"), []);
const scriptWithLock = classifyChangedFiles(["package.json", "package-lock.json"], { packageTestScriptsOnly: true });
assert.equal(scriptWithLock.dependency, true);
assert.equal(scriptWithLock.fullCore, true);
assert.equal(classifyChangedFiles(["package.json"]).fullCore, true);

assert.ok(required.includes("name: Changed package test scripts"));
assert.ok(required.includes("run: node scripts/ci-scope.mjs --run-changed-package-tests"));
console.log(
  `CI scope guard OK: ${workflowFiles.length} workflows audited; required checks stable; scenarios A-K and full-coverage contracts pass.`,
);

// HARDENING-3: evaluate the actual YAML expressions, not a mirrored ideal policy.
const jobs = workflowConditions(required);
const job = (id) => { const found = jobs.find((item) => item.id === id); assert.ok(found, `Missing job ${id}`); return found; };
const namedStep = (name) => { const found = job("validate").steps.find((step) => step.name === name); assert.ok(found, `Missing step ${name}`); return found; };
function simulation(files, eventName = "pull_request", options = {}) {
  const result = classifyChangedFiles(files, options);
  const flags = focusedPrE2eFlags(result);
  const outputs = {
    full_core: String(result.fullCore), bounded_core: String(result.boundedCore),
    package_test_scripts_only: String(result.packageTestScriptsOnly), docs_only: String(result.docsOnly),
    core: String(result.core), scopes: result.scopes.join(","),
    admin_events: String(flags.adminEvents), directory: String(flags.directory), search: String(flags.search),
    seo_recovery: String(flags.seoRecovery), sitemap_diagnostic: String(flags.sitemapDiagnostic), lost_found: String(flags.lostFound),
    production_smoke: String(productionSmokeRequired(result, {eventName, ref: "refs/heads/main"})),
  };
  const context = {
    github: {event_name: eventName, ref: "refs/heads/main", head_ref: "test/fixture"},
    steps: {"required-scope": {outputs}, scope: {outputs}},
    needs: {validate: {result: options.validateResult || "success", outputs}, scope: {outputs}},
  };
  const runs = (id) => evaluateCondition(job(id).condition, context);
  const stepRuns = (name) => evaluateCondition(namedStep(name).condition, context);
  const auto = workflowConditions(workflows.get("auto-update-automerge-prs.yml"))[0].steps.find((step) => step.name === "Update branches and release approval-gated CI");
  assert.ok(auto);
  const events = workflowConditions(workflows.get("events-fallback-images.yml")).find((j) => j.id === "public-events");
  return {result, context, runs, stepRuns,
    update: evaluateCondition(auto.condition, context), eventRoutes: (eventName === "workflow_dispatch" || (eventName === "pull_request" && prWorkflowWouldRun("events-fallback-images.yml", files))) && evaluateCondition(events.condition, context)};
}
const docsPr = simulation(["docs/audit.md"]);
const docsPush = simulation(["docs/audit.md"], "push");
for (const item of [docsPr, docsPush]) {
  for (const name of ["Install dependencies", "Lint", "Full unit and integration regression", "Bounded PR build and global safety contracts", "Adoption unit/integration suite"]) assert.equal(item.stepRuns(name), false, `Docs must skip ${name}`);
  for (const id of ["pull-request-e2e", "production-smoke", "directory-e2e", "search-e2e", "admin-events-e2e"]) assert.equal(item.runs(id), false, `Docs must skip ${id}`);
  assert.equal(item.stepRuns("Fast required-status path"), true);
  assert.equal(item.update, false);
}
const cases = [
  ["section-css", ["components/events-public.module.css"], false],
  ["directory-component", ["components/directory-card.tsx"], false],
  ["shared-hero", ["components/public-visual-system/unified-section-hero.tsx"], false],
  ["admin-editor", ["components/admin-article-editor.tsx"], false],
  ["test-script", ["package.json"], false, {packageTestScriptsOnly: true}],
  ["dependency", ["package-lock.json"], true],
  ["migration", ["drizzle/0122_entity_image_display_config.sql"], true],
  ["shared-runtime", ["worker/index.ts"], true],
  ["cross-domain-762", ["components/event-image.tsx", "components/directory-card.tsx", "components/admin-directory-editor.tsx", "components/help-card.tsx", "drizzle/0122_entity_image_display_config.sql", "package.json"], true],
  ["CI-YAML-only", [".github/workflows/playwright-e2e.yml"], false],
  ["unknown-push-range", [], true],
];
for (const [label, files, full, options] of cases) for (const event of ["pull_request", "push"]) {
  const item = simulation(files, event, options);
  assert.equal(item.stepRuns("Full unit and integration regression"), full, label);
  assert.equal(item.runs("pull-request-e2e"), false, `${label}: full browser suite is nightly/manual only`);
  assert.equal(item.stepRuns("Install dependencies"), full || item.result.boundedCore, label);
  assert.equal(item.stepRuns("Bounded PR build and global safety contracts"), item.result.boundedCore, label);
  assert.equal(item.runs("production-smoke"), event === "push" && productionSmokeRequired(item.result, {eventName:event,ref:"refs/heads/main"}), label);
}
for (const file of ["lib/pii-crypto.ts", "lib/partner-auth.ts", "lib/resource-access.ts"]) assert.equal(simulation([file]).stepRuns("Full unit and integration regression"), true, `Security ${file}`);
assert.equal(simulation(["components/directory-card.tsx"]).runs("directory-e2e"), true);
const broadDirectory = simulation(["components/directory-card.tsx", "drizzle/test.sql"]);
assert.equal(broadDirectory.runs("directory-e2e"), false);
assert.equal(broadDirectory.eventRoutes, false);
assert.equal(simulation(["components/event-card.tsx", "drizzle/0122_entity_image_display_config.sql"]).eventRoutes, true, "Events PR with a migration must retain focused E2E");
const failedBroad = simulation(["package-lock.json"], "pull_request", {validateResult:"failure"});
assert.equal(failedBroad.stepRuns("Full unit and integration regression"), true);
assert.equal(failedBroad.runs("pull-request-e2e"), false, "A failing validation must not be bypassed");
for (const event of ["schedule", "workflow_dispatch"]) {
  const resolved = resolveChangedFiles({eventName:event});
  const item = simulation(resolved.files, event);
  assert.equal(item.stepRuns("Full unit and integration regression"), true);
  assert.equal(item.runs("pull-request-e2e"), true);
  assert.equal(item.runs("production-smoke"), true);
  assert.equal(item.update, true);
  assert.equal(item.eventRoutes, event === "workflow_dispatch");
}
assert.equal(productionSmokeRequired(classifyChangedFiles(["components/event-card.tsx"]), {eventName:"push",ref:"refs/heads/topic"}), false);

// Actual disposable Git histories cover squash, merge commit, multi-commit push,
// missing/shallow commits, zero revisions and a divergent force-push.
const history = mkdtempSync(join(tmpdir(), "ci-scope-history-"));
try {
  const git = (args) => execFileSync("git", args, {cwd:history,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  git(["init", "-b", "main"]); git(["config", "user.name", "Scope Test"]); git(["config", "user.email", "scope@example.invalid"]);
  const commit = (file) => { writeFileSync(join(history,file),file);git(["add", file]);git(["commit", "-m", file]);return git(["rev-parse","HEAD"]).trim(); };
  const base = commit("README.md");
  const squash = commit("AUDIT.md");
  assert.equal(classifyChangedFiles(resolveChangedFiles({eventName:"push",baseSha:base,headSha:squash,git}).files).docsOnly, true);
  const runtime = commit("runtime.ts"); const head = commit("NEXT.md");
  assert.deepEqual(resolveChangedFiles({eventName:"push",baseSha:base,headSha:head,git}).files, ["AUDIT.md","NEXT.md","runtime.ts"]);
  git(["checkout","-b","docs",head]);commit("MERGE.md");git(["checkout","main"]);git(["merge","--no-ff","docs","-m","merge docs"]);
  const merged = git(["rev-parse","HEAD"]).trim();
  assert.deepEqual(resolveChangedFiles({eventName:"push",baseSha:head,headSha:merged,git}).files,["MERGE.md"]);
  for (const before of [undefined,"0".repeat(40),"bad-sha","f".repeat(40)]) {
    const range = resolveChangedFiles({eventName:"push",baseSha:before,headSha:head,git});
    assert.equal(range.trusted,false);assert.equal(classifyChangedFiles(range.files).fullCore,true);
  }
  git(["checkout","-b","diverged",base]);const diverged=commit("FORCE.md");
  assert.equal(resolveChangedFiles({eventName:"push",baseSha:runtime,headSha:diverged,git}).trusted,false);
  assert.equal(resolveChangedFiles({eventName:"pull_request",baseSha:runtime,headSha:diverged,git}).trusted,true);
  assert.equal(resolveChangedFiles({eventName:"push",baseSha:base,headSha:head,git:()=>{throw new Error("shallow checkout");}}).trusted,false);
} finally { rmSync(history,{recursive:true,force:true}); }

// Guard reuse and exact E2E ownership, not merely the scope boolean.
assert.ok(!job("pull-request-e2e").block.includes("run: npm run build"));
assert.ok(job("pull-request-e2e").block.includes("actions/download-artifact@v4"));
assert.ok(job("pull-request-e2e").block.includes('test "$(cat ci-build-revision.txt)" = "$(git rev-parse HEAD)"'));
assert.ok(job("validate").block.includes("actions/upload-artifact@v4"));
assert.ok(job("validate").block.includes("include-hidden-files: true"));
for (const spec of ["admin-directory-filters", "services-detail-shell", "services-search-layout", "events-hero-search", "events-calendar-redesign", "events-listing-redesign"]) assert.ok(job("pull-request-e2e").block.includes(`tests/e2e/${spec}.spec.ts`), `Full E2E must retain ${spec}`);
const autoSource = workflows.get("auto-update-automerge-prs.yml");
for (const protection of ["expected_head_sha", "action_required", "/approve", "auto_merge", "dirty)", "workflow_dispatch:"]) assert.ok(autoSource.includes(protection));


assert.equal(simulation(["components/public-visual-system/unified-section-hero.tsx"]).stepRuns("Shared visual contracts"), true);
assert.equal(simulation(["components/admin-article-editor.tsx"]).stepRuns("Shared visual contracts"), false);
for (const id of ["search-e2e", "directory-e2e"]) {
  assert.ok(!job(id).block.includes("run: npm run build"), `${id} must reuse its required build`);
  assert.ok(job(id).block.includes("actions/download-artifact@v4"));
  assert.ok(job(id).block.includes("npm run validate:deploy-artifact"));
}
assert.equal(simulation(["components/directory-card.tsx"]).stepRuns("Upload validated build for this run"), true);
assert.equal(docsPush.stepRuns("Upload validated build for this run"), false);

for (const id of ["pull-request-e2e", "search-e2e", "directory-e2e"]) assert.ok(job(id).block.includes("Validated build fingerprint mismatch"));

for (const event of ["pull_request", "push", "schedule", "workflow_dispatch"]) {
  const item = simulation(["docs/audit.md"], event);
  assert.equal(jobs.some((candidate) => candidate.id === "pr-scope"), false, "No redundant scope job");
  assert.equal(item.stepRuns("Resolve required-check scope"), true);
}
assert.ok(job("validate").block.includes("github.event.before"));
assert.ok(autoSource.includes("github.event.before"));


assert.equal(simulation(["app/README.md"], "push").runs("production-smoke"), false);
for (const file of ["public/robots.txt", "app/page.mdx"]) {
  const item = simulation([file], "push");
  assert.equal(item.result.docsOnly, false, `${file} is product source`);
  assert.equal(item.runs("production-smoke"), true);
  assert.equal(item.stepRuns("Install dependencies"), true);
}


const failedPush = simulation(["worker/index.ts"], "push", {validateResult:"failure"});
assert.equal(failedPush.runs("production-smoke"), false);
assert.equal(failedPush.runs("pull-request-e2e"), false);
console.log("HARDENING-3 PASS: 14 required scenarios, actual YAML job/step conditions, production/manual/schedule, security, artifact/E2E ownership and real Git range failures.");

 
// HARDENING-4 — evaluate real YAML predicates against representative change sets.
assert.equal(jobs.filter((item) => item.id === "validate").length, 1);
assert.ok(!jobs.some((item) => item.id === "pr-scope"));
assert.ok(job("validate").block.includes("outputs:"));
assert.ok(job("validate").block.includes("steps.required-scope.outputs.sitemap_diagnostic"));
assert.doesNotMatch(required, /github\.head_ref/, "No feature-branch-specific gating");
for (const id of ["admin-events-e2e", "search-e2e", "directory-e2e"]) {
  assert.ok(job(id).condition.includes("github.event_name == 'pull_request'"), id);
  assert.ok(!job(id).condition.includes("github.event_name == 'push'"), id);
  assert.ok(job(id).block.includes("needs: validate"), id);
}
for (const id of ["pull-request-e2e", "production-smoke"]) {
  assert.ok(job(id).block.includes("needs.validate.outputs"), id);
  assert.ok(job(id).block.includes("needs.validate.result == 'success'"), id);
}
const coverage4 = [
  ["map", ["components/map/public-location-map.tsx"], ["MAPS"], ["map-public-ui-ci.yml"]],
  ["profiles", ["components/directory-profile-detail.tsx"], ["DIRECTORY_SERVICES", "ENTITY_SURFACES"], ["sitewide-ai-entity-surface-ci.yml"]],
  ["homepage", ["app/page.tsx"], [], ["homepage-name-days-ci.yml"]],
  ["articles", ["components/article-detail.tsx"], ["ARTICLES"], ["article-ux-ci.yml"]],
  ["notion-sync", ["lib/notion-article-sync.ts"], ["NOTION"], ["notion-article-sync-ci.yml"]],
  ["admin", ["components/admin-article-editor.tsx"], ["ADMIN", "ARTICLES"], ["article-admin-ci.yml"]],
  ["documentation", ["README.md", "docs/ci-usage.md"], [], []],
  ["production-migration", ["drizzle/0125_live_schema.sql"], ["DATABASE_MIGRATIONS"], ["clean-d1-migration-validation.yml"]],
];
for (const [label, files, expectedScopes, relevantWorkflows] of coverage4) {
  const pr = simulation(files, "pull_request");
  for (const scope of expectedScopes) assert.ok(pr.result.scopes.includes(scope), `${label}: ${scope}`);
  for (const wf of relevantWorkflows) assert.equal(prWorkflowWouldRun(wf, files), true, `${label}: ${wf}`);
  assert.equal(pr.stepRuns("Resolve required-check scope"), true, label);
  if (label === "documentation") assert.equal(pr.stepRuns("Install dependencies"), false);
  if (label === "production-migration") assert.equal(pr.stepRuns("Full unit and integration regression"), true);
}
for (const [name, file, jobName] of [
  ["sitemap", "app/sitemap.ts", "sitemap-production-diagnostic"],
  ["seo", "lib/seo-metadata.ts", "seo-recovery-e2e"],
  ["lost-found", "lib/lost-found-store.ts", "lost-found-public-e2e"],
]) {
  assert.equal(simulation([file]).runs(jobName), true, `${name} change must exercise ${jobName}`);
  assert.equal(simulation(["docs/audit.md"]).runs(jobName), false, `${name} docs skip`);
}
assert.equal(simulation(["lib/seo-metadata.ts"]).runs("sitemap-production-diagnostic"), false);
for (const file of ["components/directory-card.tsx", "app/hladat/page.tsx", "app/admin/events/page.tsx"]) {
  const push = simulation([file], "push");
  for (const jobName of ["directory-e2e", "search-e2e", "admin-events-e2e"]) {
    assert.equal(push.runs(jobName), false, `${jobName}: no post-merge rerun`);
  }
  assert.equal(push.runs("production-smoke"), true, "Production smoke must remain active");
}
assert.ok(job("pull-request-e2e").block.includes("tests/e2e/public-ux-foundation-v3.spec.ts"));
assert.ok(job("lost-found-public-e2e").block.includes("tests/e2e/lost-found-dogs.spec.ts"));
console.log("HARDENING-4 PASS: branch-neutral focused PR suites, 8 domain scenarios, post-merge smoke.");

