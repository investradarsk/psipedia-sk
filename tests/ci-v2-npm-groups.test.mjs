import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GROUPS, planGroup, runCli, planDistinctPackageSuites } from "../scripts/ci-test-groups.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const { scripts } = readJson("../package.json");
const { packageScripts: baseline } = readJson("../docs/ci-v2-inventory-baseline.json");

// Compare named file + exact Node flags, and all other commands. This lexical
// check is scoped to the existing && / npm run structure, not test execution.
function expand(map, name, stack = []) {
  assert.ok(!stack.includes(name), "recursive script: " + name);
  assert.equal(typeof map[name], "string", "missing script: " + name);
  return map[name].split(/\s*&&\s*/).flatMap((command) => {
    const child = command.match(/^npm run ([\w:-]+)$/);
    if (child) return expand(map, child[1], [...stack, name]);
    const files = command.match(/tests\/[\w./-]+\.test\.[cm]?[jt]s/g) ?? [];
    return files.length
      ? files.map((file) => command.split(/\s+tests\//)[0] + "|" + file)
      : ["COMMAND|" + command];
  });
}

// New tools are additive; preserve the exact historical command coverage while
// allowing only these explicitly reviewed new test invocations.
const addedPersonalToolEntries = [
  "puppy-equipment", "dog-health-calendar", "dog-calculators", "event-subscription",
].map(name => "node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test|tests/" + name + ".test.mjs");

test("legacy scripts retain static test and command parity", () => {
  for (const name of Object.keys(baseline)) {
    assert.equal(typeof scripts[name], "string", name);
    if (name !== "test" && !name.startsWith("test:")) continue;
    assert.deepEqual(
      [...new Set(expand(scripts, name))].sort(),
      [...new Set([...expand(baseline, name), ...(name === "test" ? addedPersonalToolEntries : [])])].sort(),
      name,
    );
  }
});

test("personal dog tools are explicitly included in the public group and aggregate", () => {
  assert.deepEqual(expand(scripts, "test:personal-dog-tools").sort(), [...addedPersonalToolEntries].sort());
  assert.ok(planGroup("public", scripts).includes("test:personal-dog-tools"));
});

test("confirmed identical duplicate invocations are removed from aggregates", () => {
  const cache = "node --experimental-strip-types --test|tests/public-html-cache.test.mjs";
  assert.equal(expand(scripts, "test").filter((entry) => entry === cache).length, 1);
  for (const name of [
    "admin-pwa.test.mjs",
    "admin-mobile-document-navigation.test.mjs",
    "admin-page-streaming-step4.test.mjs",
  ]) {
    const entry = "node --experimental-strip-types --test|tests/" + name;
    assert.equal(expand(scripts, "test:admin-pwa").filter((value) => value === entry).length, 1);
  }
});

test("eight explicit groups reference existing scripts only", () => {
  assert.equal(Object.keys(GROUPS).length, 8);
  for (const name of Object.keys(GROUPS)) {
    const plan = planGroup(name, scripts);
    assert.equal(new Set(plan).size, plan.length);
    assert.ok(!plan.includes("test:ci"), "recursive dispatcher");
    assert.ok(plan.every((entry) => !/^(deploy:|e2e:production|db:generate|audit:production)/.test(entry)));
  }
  assert.throws(() => planGroup("unknown", scripts), /Unknown test group/);
  assert.throws(() => planGroup("admin", {}), /Missing package script/);
});

test("list and plan are read-only; execution stops on first failure", () => {
  const calls = [];
  const print = () => {};
  const run = (...args) => { calls.push(args); return { status: 9 }; };
  const opts = { scripts, npmPath: "/fake/npm-cli.js", run, print, error: print };
  assert.equal(runCli([], opts), 0);
  assert.equal(runCli(["admin", "--plan"], opts), 0);
  assert.equal(runCli(["unknown"], opts), 2);
  assert.equal(runCli(["admin", "--unknown"], opts), 2);
  assert.equal(calls.length, 0);
  assert.equal(runCli(["admin"], opts), 9);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["/fake/npm-cli.js", "run", GROUPS.admin[0]]);
  assert.equal(runCli(["admin"], { ...opts, run: () => ({ status: null, signal: "SIGTERM" }) }), 1);
});

test("repeated pure nested npm suites run only once while distinct contexts remain", () => {
  const map = {
    "test:a": "node --test tests/a.test.mjs",
    "test:b": "node --experimental-strip-types --test tests/a.test.mjs",
    "test:all": "npm run test:a && npm run test:b",
    "test:other": "node --test tests/a.test.mjs",
    "test:mixed": "npm run test:a && npm run test:other",
  };
  assert.deepEqual(planDistinctPackageSuites(["test:all", "test:a", "test:b", "test:other"], map),
    { run: ["test:all", "test:other"], skipped: ["test:a", "test:b"] });
  assert.deepEqual(planDistinctPackageSuites(["test:a", "test:mixed"], map),
    { run: ["test:a", "test:mixed"], skipped: [] });
  assert.deepEqual(planDistinctPackageSuites(["test:all", "test:a"], {...map, "pretest:a": "echo setup"}),
    { run: ["test:all", "test:a"], skipped: [] });
  assert.deepEqual(planDistinctPackageSuites(["test:a", "test:opaque", "test:a"], {...map, "test:opaque": "echo other"}),
    { run: ["test:a", "test:opaque", "test:a"], skipped: [] });
  assert.deepEqual(planDistinctPackageSuites(["test:cycle"], {"test:cycle": "npm run test:cycle"}),
    { run: ["test:cycle"], skipped: [] });
  assert.throws(() => planDistinctPackageSuites(["test:missing"], map), /Missing package script/);
});

test("full shared-worker gate does not run the cache safety file twice", () => {
  const pair = "node --experimental-strip-types --test|tests/public-html-cache-safety.test.mjs";
  assert.equal(expand(scripts, "test").filter(entry => entry === pair).length, 1);
  const source = readFileSync(new URL("../.github/workflows/playwright-e2e.yml", import.meta.url), "utf8");
  const start = source.indexOf("      - name: Shared-worker cache and sitemap safety contracts");
  const end = source.indexOf("      - name:", start + 10);
  assert.ok(start >= 0 && end > start);
  const step = source.slice(start, end);
  assert.match(step, /full_core == 'true'/);
  assert.match(step, /tests\/sitemap-edge-cache\.test\.mjs tests\/sitemap-xml-hardening\.test\.mjs/);
  assert.doesNotMatch(step, /public-html-cache-safety\.test\.mjs/);
});
