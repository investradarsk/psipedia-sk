#!/usr/bin/env node
/**
 * Read-only inventory of *tracked* breed JSON sources.
 *
 * This is a code-level audit, not a live Cloudflare D1 query. It never runs
 * DELETE, DROP, UPDATE, migrations, Notion calls, or writes to any data store.
 * The only deletion candidates are truly unattached data files. The managed
 * SQL columns with live references must not be deleted in cleanup step 1.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const RUNTIME_FILES=[
  "lib/breed-store.ts",
  "lib/breed-canonical.ts",
  "lib/notion-breed-workcopy-field-sql.mjs",
  "lib/breed-import.ts",
  "lib/breed-audit.ts",
  "lib/admin-seo-quality-entities.ts",
  "lib/notion-breed-workcopy-controlled.ts",
  "lib/breed-public-controlled.ts",
];
const breedJsonFile = path =>
  /^(?:data|lib|public)\/.*(?:breed|plemen|fci)[^/]*\.json$/i.test(path);
const testFixture = path => /^tests\/fixtures\/breed[^/]*\.json$/i.test(path);
const colPattern = /(?:text|integer)\("([a-z][a-z0-9_]*_json)"\)/g;

export function auditBreedJsonSources({paths,schema,runtimeSources}) {
  const start=schema.indexOf("export const managedBreeds =");
  const end=schema.indexOf("export const breedArticleRelations =",start);
  if(start<0||end<start)throw Error("BREED_JSON_SCHEMA_SECTION_NOT_FOUND");
  const segment=schema.slice(start,end);
  const columns=[...new Set([...segment.matchAll(colPattern)].map(m=>m[1]))];
  const liveColumns=columns.map(column=>{
    const readers=Object.entries(runtimeSources)
      .filter(([,content])=>content.includes(column))
      .map(([path])=>path);
    return {column,source:"managed_breeds",runtimeReferences:readers,
      safeToDelete:readers.length===0};
  });
  const files=paths.filter(path=>path.endsWith(".json"))
    .filter(path=>breedJsonFile(path)||testFixture(path));
  const dataFiles=files.filter(breedJsonFile);
  const fixtures=files.filter(testFixture);
  return {
    scope:"code-only / tracked repository, not remote D1 or live Notion",
    liveSqlJsonColumns:liveColumns,
    archivedBreedJsonDataFiles:dataFiles,
    schemaTestFixtures:fixtures,
    candidatesForSafeDeletion:[
      ...dataFiles,
      ...liveColumns.filter(col=>col.safeToDelete).map(col=>col.column),
    ],
    protectedControlledJsonSidecar:[
      "breed_notion_controlled_values.values_json",
      "breed_notion_controlled_values.notion_values_json",
    ],
    historicalBreedFallback:"lib/content.ts (TypeScript seed, NOT a .json data file; public no-D1 fallback)",
    guidance:"Never drop live SQL JSON until public+Admin+Notion reads/writes are switched and verified.",
  };
}

export function auditCurrentRepo(root=ROOT) {
  const paths=execFileSync("git",["ls-files","-z"],{cwd:root,encoding:"utf8"})
    .split("\0").filter(Boolean);
  const schema=readFileSync(join(root,"db/schema.ts"),"utf8");
  const runtimeSources=Object.fromEntries(RUNTIME_FILES.map(path=>[
    path,readFileSync(join(root,path),"utf8"),
  ]));
  return auditBreedJsonSources({paths,schema,runtimeSources});
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=auditCurrentRepo();
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  // A missing runtime reference is a review candidate, never permission
  // to automatically DROP a column.
}
