import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/admin-import-plan.ts", import.meta.url), "utf8");
const start = source.indexOf("function duplicateAwareAction(");
const end = source.indexOf("export async function buildGeneralImportPlan(", start);
assert.ok(start !== -1 && end > start);

const js = ts.transpileModule(
  source.slice(start, end) + "\nexports.duplicateAwareAction = duplicateAwareAction;",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const bindings = {};
runInNewContext(js, { exports: bindings });
const action = bindings.duplicateAwareAction;

test("all existing directory identities are skipped regardless of publication state", () => {
  for (const status of ["draft", "published", "archived", "scheduled"]) {
    const result = action("import:old-key", new Set(), status, "Profil 1", true);
    assert.equal(result.action, "skipped", status);
  }
});

test("new identity still inserts and duplicate identity within one file is rejected", () => {
  const seen = new Set();
  assert.equal(action("import:new", seen, undefined, "Profil 1", true).action, "inserted");
  assert.equal(action("import:new", seen, undefined, "Profil 2", true).action, "rejected");
});

test("other generic import domains retain their previous explicit update behavior", () => {
  assert.equal(action("article:one", new Set(), "draft", "Článok", false).action, "updated");
});

test("profile preview skips old rows without merging their historic JSON payloads", () => {
  assert.match(source, /result\.action !== "inserted"/);
  assert.match(source, /profileSources\.push\(null\)/);
  assert.match(source, /prepareGeneralDirectorySourceImport\(row, identity\.category, null\)/);
  assert.doesNotMatch(source, /prepareGeneralDirectorySourceImport\(row, identity\.category, existing\?\.source_data_json/);
});

test("production write path is create-only, not a post-preview upsert", () => {
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const sqlStart = route.indexOf("INSERT INTO directory_profiles (");
  const sqlEnd = route.indexOf("`).bind(", sqlStart);
  assert.ok(sqlStart >= 0 && sqlEnd > sqlStart);
  const profileInsert = route.slice(sqlStart, sqlEnd);
  assert.match(profileInsert, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(profileInsert, /DO UPDATE SET|source_data_json=excluded/);
  assert.match(route, /results\[statementIndex\]\?\.meta\?\.changes !== 1/);
});
