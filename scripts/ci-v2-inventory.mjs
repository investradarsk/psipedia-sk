import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Read-only source inventory. Run from repository root. No workflow execution.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean).sort();
const read = (path) => readFileSync(path, "utf8");
const unique = (items) => [...new Set(items)].sort();
const testRefs = (source) => unique(
  source.match(/tests\/[\w./-]+\.(?:test|spec)\.[cm]?[jt]s/g) ?? [],
);
const npmRefs = (source) => unique(
  [...source.matchAll(/\bnpm\s+(?:run(?:-script)?\s+([\w:-]+)|(test|ci))\b/g)]
    .map((match) => match[1] ?? match[2]),
);
const scripts = JSON.parse(read("package.json")).scripts ?? {};
const nodeTests = files.filter((path) => /^tests\/.*\.test\.[cm]?[jt]s$/.test(path));
const playwrightSpecs = files.filter((path) => /^tests\/.*\.spec\.[cm]?[jt]s$/.test(path));
const workflowPaths = files.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path));

// Keep raw YAML source blocks rather than silently treating a heuristic as
// an evaluated Actions expression. Complex YAML and dynamic dispatch need review.
function topLevelBlock(source, key) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp("^" + key + "\\s*:").test(line),
  );
  if (start === -1) return null;
  const next = lines.findIndex((line, index) =>
    index > start && /^[\w-]+\s*:/.test(line),
  );
  return lines.slice(start, next === -1 ? undefined : next).join("\n").trimEnd();
}

function expandScript(name, visited = new Set()) {
  if (visited.has(name) || !Object.hasOwn(scripts, name)) return [];
  visited.add(name);
  const source = scripts[name];
  return unique([
    ...testRefs(source),
    ...npmRefs(source).flatMap((child) => expandScript(child, visited)),
  ]);
}

const workflows = workflowPaths.map((path) => {
  const source = read(path);
  const npmScripts = npmRefs(source);
  return {
    path,
    name: source.match(/^name:\s*(.+)$/m)?.[1] ?? null,
    rawTriggers: topLevelBlock(source, "on"),
    rawConcurrency: topLevelBlock(source, "concurrency"),
    jobNames: source.split(/\r?\n/).filter((line) =>
      /^ {4}name:/.test(line),
    ).map((line) => line.trim()),
    npmScripts,
    directTestFiles: testRefs(source),
    expandedTestFiles: unique([
      ...testRefs(source),
      ...npmScripts.flatMap((name) => expandScript(name)),
    ]),
    mentionsBuild: /\bnpm\s+run\s+build\b/.test(source),
    mentionsLint: /\bnpm\s+run\s+lint\b/.test(source),
    mentionsPlaywright: /\bplaywright\b/i.test(source),
    mentionsMigrationCheck: /\bnpm\s+run\s+db:(?:check-migrations|validate-clean)\b/.test(source),
    referencedScripts: unique(source.match(/scripts\/[\w./-]+\.(?:mjs|js|ts|sh|py)/g) ?? []),
    // This is a review flag only, not an authorization or side-effect classifier.
    requiresManualSafetyReview: /production|workflow_dispatch|schedule:|wrangler|secrets\./i.test(source),
  };
});
const referenced = new Set(workflows.flatMap((workflow) => workflow.expandedTestFiles));
const result = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  limitations: [
    "Lexical source inventory, not evaluated workflow execution or measured coverage.",
    "Run from a clean checkout of the revision being inventoried.",
    "Dynamic shell commands, glob expansion, reusable workflows and helper scripts require manual review.",
    "Raw YAML blocks use conventional unquoted top-level keys; review null or unusual results.",
    "Unreferenced tests are not necessarily unused. Never delete based on this report alone.",
  ],
  counts: {
    workflows: workflows.length,
    nodeTests: nodeTests.length,
    playwrightSpecs: playwrightSpecs.length,
    packageTestScripts: Object.keys(scripts).filter((name) => name === "test" || name.startsWith("test:")).length,
    workflowsMentioningBuild: workflows.filter((workflow) => workflow.mentionsBuild).length,
  },
  workflows,
  packageScriptTests: Object.fromEntries(
    Object.keys(scripts).map((name) => [name, expandScript(name)]),
  ),
  nodeTests,
  playwrightSpecs,
  noStaticWorkflowReference: [...nodeTests, ...playwrightSpecs].filter((path) => !referenced.has(path)),
};
console.log(JSON.stringify(result, null, 2));
