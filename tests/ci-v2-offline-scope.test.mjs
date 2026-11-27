import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveOfflineRange, selectOfflineSuites } from "../scripts/ci-offline-scope.mjs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const suites = JSON.parse(read(".github/ci/offline-suites.json"));
const workflow = read(".github/workflows/offline-contracts.yml");
const ids = files => selectOfflineSuites(suites, files).map(s => s.id);

test("historical offline suites retain scope and all are wired into the shared job", () => {
  assert.equal(suites.length, 11);
  assert.equal(new Set(suites.map(s=>s.id)).size, suites.length);
  for (const s of suites) {
    assert.match(workflow, new RegExp("steps\\.scope\\.outputs\\." + s.id + " == 'true'"));
    assert.ok(s.paths.length);
    assert.ok(s.paths.every(p => !p.startsWith("!")));
  }
  assert.ok(ids(["components/admin-event-editor.tsx"]).includes("admin_typography_contracts"));
  assert.ok(ids(["components/public-visual-system/foo/bar.tsx"]).includes("public_listings_qa"));
  assert.ok(ids(["app/api/admin/directory/45/route.ts"]).includes("admin_legacy_mutation_csrf"));
  assert.ok(ids(["tests/admin-perf-analyze.test.mjs"]).includes("admin_perf_comparator_v2"));
  assert.deepEqual(ids(["docs/unrelated.md"]), []);
  assert.equal(selectOfflineSuites(suites, ["components/admin-event-editor.tsx"], {baseRef:"other"}).some(s=>s.id==="admin_typography_contracts"),false);
});
test("unknown or empty diff, manual run and CI changes select all suites", () => {
  for (const file of [".github/workflows/offline-contracts.yml",".github/ci/offline-suites.json","scripts/ci-offline-scope.mjs","tests/ci-v2-offline-scope.test.mjs"]) assert.equal(ids([file]).length, suites.length);
  assert.equal(ids([]).length, suites.length);
  assert.equal(selectOfflineSuites(suites, ["README.md"], {trusted:false}).length, suites.length);
  assert.equal(selectOfflineSuites(suites, ["README.md"], {event:"workflow_dispatch"}).length, suites.length);
});
test("complete PR diff includes removed and added paths; unavailable range fails closed", () => {
  const base="a".repeat(40),head="b".repeat(40);
  assert.deepEqual(resolveOfflineRange({base,head,git:args=>{
    assert.deepEqual(args,["diff","--no-renames","--name-only","-z",base+"..."+head]);
    return "old.ts\0new.ts\0";
  }}),{files:["old.ts","new.ts"],trusted:true});
  assert.deepEqual(resolveOfflineRange({base,head,git:()=>{throw Error("missing")}}),{files:[],trusted:false});
  assert.deepEqual(resolveOfflineRange({base:"invalid",head}),{files:[],trusted:false});
});
