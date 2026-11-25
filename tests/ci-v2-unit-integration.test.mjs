import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GROUPS, planGroup } from "../scripts/ci-test-groups.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const { scripts } = JSON.parse(read("package.json"));

// Deliberately recognize only the current explicit Node test grammar.
// Unknown shell commands are opaque and retained; no shell rewriting at runtime.
function expand(name, stack = []) {
  assert.ok(!stack.includes(name), "Recursive npm script: " + name);
  assert.equal(typeof scripts[name], "string", "Missing script: " + name);
  return scripts[name].split(/\s*&&\s*/).flatMap((command) => {
    const child = command.match(/^npm run ([\w:-]+)$/);
    if (child) return expand(child[1], [...stack, name]);
    const direct = command.match(/^(node(?: [\w./=-]+)* --test)((?: tests\/[\w./-]+\.test\.[cm]?[jt]s)+)$/);
    if (!direct) return ["COMMAND|" + command];
    return direct[2].trim().split(" ").map((file) => direct[1] + "|" + file);
  });
}

const union = (entries) => [...new Set(entries)].sort();
const flatten = (names) => names.flatMap((name) => expand(name));
const testEntries = (entries) => entries.filter((entry) => !entry.startsWith("COMMAND|"));

// Historical compositions are expressed using the live standalone aliases,
// so adding a test to an alias cannot silently drop it from a group.
const legacy = {
  admin: [
    "test:admin-stability-step10", "test:admin-performance-v2", "test:admin-buttons",
    "test:admin-events", "test:article-admin-editor", "test:image-editor-2",
  ],
  database: ["db:check-migrations", "db:validate-clean", "test:migration-safety", "test:record-lifecycle"],
  "seo-performance": [
    "test:perf-fastpaths", "test:public-css-scope", "test:seo-metadata", "test:seo-structured-data",
    "test:sitewide-ai-entity-surface", "test:social-metadata", "test:social-metadata-rendered",
    "test:breed-crawl-hierarchy", "test:breeding-station-ai-landings", "test:directory-ai-landings-scale",
    "test:internal-discovery", "test:ai-referral",
  ],
};

for (const [group, oldAliases] of Object.entries(legacy)) {
  test(group + " preserves legacy command and file/loader coverage", () => {
    const original = flatten(oldAliases);
    const optimized = flatten(planGroup(group, scripts));
    assert.deepEqual(union(optimized), union(original));
    const entries = testEntries(optimized);
    assert.equal(entries.length, new Set(entries).size, "identical test contexts should not repeat");
    assert.deepEqual(
      optimized.filter((entry) => entry.startsWith("COMMAND|")),
      original.filter((entry) => entry.startsWith("COMMAND|")),
      "opaque commands must keep their multiplicity and order",
    );
  });
}

test("Admin search retains both distinct loader contexts", () => {
  const entries = flatten(GROUPS.admin).filter((entry) => entry.endsWith("|tests/admin-global-search.test.mjs"));
  assert.deepEqual(union(entries), [
    "node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test|tests/admin-global-search.test.mjs",
    "node --experimental-strip-types --test|tests/admin-global-search.test.mjs",
  ]);
});

test("standalone aliases still include PWA and lifecycle migration", () => {
  const admin = expand("test:admin-performance-v2");
  for (const entry of expand("test:admin-pwa")) assert.ok(admin.includes(entry), entry);
  assert.ok(expand("test:record-lifecycle").includes("node --test|tests/admin-record-lifecycle-migration.test.mjs"));
});

test("entity CI uses the combined unit suite without dropping structured data", () => {
  const workflow = read(".github/workflows/sitewide-ai-entity-surface-ci.yml");
  assert.match(workflow, /run: npm run test:sitewide-ai-entity-surface/);
  assert.doesNotMatch(workflow, /run: npm run test:seo-structured-data(?:\s|$)/);
  const entity = expand("test:sitewide-ai-entity-surface");
  for (const entry of expand("test:seo-structured-data")) assert.ok(entity.includes(entry), entry);
  assert.match(workflow, /tests\/rendered-html\.test\.mjs tests\/sitemap-seo\.test\.mjs/);
  assert.match(workflow, /public-entity-playwright:\n/);
});
