import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  auditBreedJsonSources,auditCurrentRepo,
} from "../scripts/audit-breed-json-legacy.mjs";

test("live breed JSON columns are all still referenced in production code",()=>{
  const report=auditCurrentRepo();
  const expected=[
    "gallery_json","fci_standard_json","editorial_json","sports_json",
    "related_breeds_json","health_risks_json","good_for_json",
    "consider_json","sources_json","seo_json",
  ];
  assert.deepEqual(report.liveSqlJsonColumns.map(x=>x.column).sort(),expected.sort());
  for(const column of report.liveSqlJsonColumns){
    assert.ok(column.runtimeReferences.length>0,column.column);
    assert.equal(column.safeToDelete,false,column.column);
  }
  assert.deepEqual(report.archivedBreedJsonDataFiles,[]);
  assert.deepEqual(report.candidatesForSafeDeletion,[]);
  assert.ok(report.schemaTestFixtures.includes("tests/fixtures/breed-notion-workcopy-74-schema.json"));
  assert.ok(report.schemaTestFixtures.includes("tests/fixtures/breed-notion-workcopy-90-schema.json"));
  assert.match(report.scope,/not remote D1/);
});

test("unreferenced data candidates are suggestions, never automated deletions",()=>{
  const r=auditBreedJsonSources({
    paths:["data/old-breed-archive.json","tests/fixtures/breed-notion-workcopy-90-schema.json",
      "data/other-report.json"],
    schema:`export const managedBreeds = sqliteTable("managed_breeds", {
      galleryJson: text("gallery_json"),
      ghostJson: text("ghost_json")
    });
    export const breedArticleRelations = sqliteTable("breed_article_relations", {});`,
    runtimeSources:{"lib/breed-store.ts":"SELECT gallery_json FROM managed_breeds"},
  });
  assert.deepEqual(r.archivedBreedJsonDataFiles,["data/old-breed-archive.json"]);
  assert.deepEqual(r.liveSqlJsonColumns.find(x=>x.column==="ghost_json")?.safeToDelete,true);
  assert.equal(r.liveSqlJsonColumns.find(x=>x.column==="gallery_json")?.safeToDelete,false);
  assert.ok(r.candidatesForSafeDeletion.includes("ghost_json"));
  assert.ok(r.candidatesForSafeDeletion.includes("data/old-breed-archive.json"));
});

test("step 1 audit is a pure inspection, without production writes",()=>{
  const code=readFileSync(new URL("../scripts/audit-breed-json-legacy.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(code,/\b(?:wrangler|notionRequest|mcp__|fetch\()\b/);
  assert.doesNotMatch(code,/\b(?:unlinkSync|rmSync|deleteFile|writeFileSync|UPDATE managed_breeds|DROP TABLE)\b/);
});

test("production D1 audit only performs aggregates and cannot modify rows",()=>{
  const code=readFileSync(new URL("../scripts/production-breed-json-audit.mjs",import.meta.url),"utf8");
  assert.match(code,/SELECT/);
  assert.match(code,/BREED_JSON_MANUAL_CURRENT_MAIN_REQUIRED/);
  assert.match(code,/dropApproved:false/);
  assert.doesNotMatch(code,/\b(?:DELETE FROM|DROP TABLE|ALTER TABLE|UPDATE managed_breeds|INSERT INTO managed_breeds)\b/);
});
