import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { selectOfflineSuites } from "../scripts/ci-offline-scope.mjs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const suites = JSON.parse(read(".github/ci/notion-quality-suites.json"));
const workflow = read(".github/workflows/notion-quality-ci.yml");
test("four former Notion workflows share one install, lint and build", () => {
  assert.equal(suites.length,4);
  for (const suite of suites) {
    assert.equal(existsSync(new URL("../" + suite.original, import.meta.url)),false);
    for (const pattern of suite.paths) assert.ok(workflow.includes("      - " + JSON.stringify(pattern)), pattern);
    for (const command of suite.commands) {
      const needle = "        run: " + JSON.stringify(command);
      assert.equal(workflow.split("\n").filter(l=>l===needle).length,1,command);
      const index=workflow.indexOf(needle);
      assert.ok(workflow.slice(workflow.lastIndexOf("        if: ",index),index).includes("steps.scope.outputs."+suite.id+" == 'true'"),command);
    }
  }
  assert.equal(workflow.match(/^\s+run: npm ci$/gm)?.length,1);
  assert.match(workflow,/cache-dependency-path: package-lock\.json/);
  assert.ok(workflow.indexOf('run: "npm run lint"') < workflow.indexOf('run: "npm run build"'));
});
test("Notion contracts remain scoped and fail closed on unknown revision",()=>{
  const ids=files=>selectOfflineSuites(suites,files).map(s=>s.id);
  assert.deepEqual(ids(["lib/notion-article-sync.ts"]),["notion_article_sync_ci"]);
  assert.deepEqual(ids(["lib/notion-data-quality-cross-batch.ts"]),["notion_cross_batch_ci"]);
  assert.deepEqual(ids(["lib/notion-directory-sync.ts"]),["notion_article_sync_ci","notion_events_help_sync_ci"]);
  assert.deepEqual(ids(["worker/index.ts"]),[]);
  assert.deepEqual(ids(["package-lock.json"]),[]);
  assert.equal(ids([".github/workflows/notion-quality-ci.yml"]).length,4);
  assert.equal(selectOfflineSuites(suites,["README.md"],{trusted:false}).length,4);
});
