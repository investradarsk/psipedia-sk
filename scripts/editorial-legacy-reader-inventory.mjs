/**
 * Phase 4 – deterministic, read-only source-code inventory of Directory
 * JSON consumers. Lists file paths and match counts only, never source
 * lines, runtime data, credentials, contact fields or Notion payloads.
 *
 * IMPORTANT: matches include legitimate technical metadata and structured
 * JSON. This report identifies candidates for human review; it is NOT an
 * automatic deletion list or complete reachability proof.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const ROOTS = ["app", "lib", "components", "db"];
const SKIP = new Set(["node_modules",".next",".git","dist","coverage",".openai",".wrangler"]);
const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const SIGNALS = Object.freeze({
  source_data_json:/\bsource_data_json\b/g,
  sourceDataJson:/\bsourceDataJson\b/g,
  categorySql:/\bdirectoryCategoryMembershipSql\b/g,
  additionalCategories:/\b(?:directoryAdditionalCategoryJsonSql|readAdditionalDirectoryCategories)\b/g,
  publicSourceFacets:/\b(?:DIRECTORY_PUBLIC_SOURCE_FACETS|directoryEffectiveDistrictSql)\b/g,
  publicFacts:/\b(?:readDirectoryPublicMetadataValue|readDirectoryPublicMetadataSource)\b/g,
});
const EXPECTED = Object.freeze([
  "lib/directory-store.ts",
  "lib/directory-multi-category.ts",
  "lib/directory-public-source-contract.ts",
  "lib/notion-directory-sync.ts",
  "app/api/admin/directory/[id]/route.ts",
]);

async function sourceFiles(dir, output) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (SKIP.has(entry.name)) continue;
    const abs=join(dir,entry.name);
    if (entry.isDirectory()) await sourceFiles(abs,output);
    else if (entry.isFile() && CODE_EXT.test(entry.name)) output.push(abs);
  }
}
function fileArea(path) {
  if (path.startsWith("app/api/admin/directory/")) return "Admin directory API";
  if (path.startsWith("app/adresar/")) return "Public directory route";
  if (path.startsWith("lib/notion-")) return "Notion bridge";
  if (path.startsWith("components/")) return "Presentation/editor";
  if (path.startsWith("lib/directory")) return "Directory data contracts";
  if (path.startsWith("db/")) return "SQL schema";
  return "Other code";
}
export function findDirectoryLegacyReferences(path, source) {
  if (typeof path!=="string" || typeof source!=="string")
    throw new Error("DIRECTORY_LEGACY_SOURCE_AUDIT_BAD_ARGUMENT");
  const signals={};
  for (const [name,regex] of Object.entries(SIGNALS)) {
    regex.lastIndex=0;
    const count=[...source.matchAll(regex)].length;
    if (count) signals[name]=count;
  }
  const total=Object.values(signals).reduce((n,v)=>n+v,0);
  return total ? {path,area:fileArea(path),count:total,signals} : null;
}
export async function inspectDirectoryLegacyCode(root=ROOT) {
  const paths=[];
  for (const dir of ROOTS) await sourceFiles(join(root,dir),paths);
  paths.sort((a,b)=>a.localeCompare(b,"en"));
  const references=[];
  const allFiles=new Set(paths.map(p=>relative(root,p).replaceAll("\\","/")));
  for(const file of paths) {
    const path=relative(root,file).replaceAll("\\","/");
    const item=findDirectoryLegacyReferences(path,await readFile(file,"utf8"));
    if(item) references.push(item);
  }
  const missingCritical=EXPECTED.filter(path=>!allFiles.has(path));
  if(missingCritical.length)
    throw new Error("DIRECTORY_LEGACY_AUDIT_MISSING_CRITICAL_SOURCE: "+missingCritical.join(","));
  const signalTotals=Object.fromEntries(Object.keys(SIGNALS).map(key=>[
    key,references.reduce((n,item)=>n+(item.signals[key]??0),0),
  ]));
  return {
    status:"human_review_required",readOnly:true,
    scope:"Directory source code in app/lib/components/db only",
    scannedFiles:paths.length,
    candidateFiles:references.length,
    candidateReferences:references.reduce((n,r)=>n+r.count,0),
    signalTotals,references,
    warnings:[
      "Static token references are not equivalent to executed public reads.",
      "Technical JSON, image metadata, filters, category relations and legacy aliases may be intentional.",
      "This does not verify Notion, production D1 migration, backfill, Admin or public value parity.",
      "No files, SQL data or Notion pages were modified by this inventory.",
    ],
  };
}

async function main() {
  const output=process.argv[2]
    ? resolve(process.argv[2])
    : join(ROOT,".production-editorial-storage-readonly/source-readers.json");
  const report=await inspectDirectoryLegacyCode();
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    status:report.status,scannedFiles:report.scannedFiles,
    candidateFiles:report.candidateFiles,
    candidateReferences:report.candidateReferences,
  })+"\n");
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(err=>{
    console.error("DIRECTORY_LEGACY_SOURCE_AUDIT_FAILED",
      err instanceof Error?err.message:"UNKNOWN");
    process.exitCode=1;
  });
}
