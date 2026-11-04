import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const inventory = JSON.parse(readFileSync("lib/generated/visual-library-public-inventory.json","utf8"));
const previewSource = readFileSync("components/admin-component-visual-preview.tsx","utf8");
const previewMatches = [...previewSource.matchAll(/\{\s*id:\s*"([^"]+)",\s*path:\s*"([^"]+)"/g)];
const previewPaths = new Set(previewMatches.map((x)=>x[2]));
const SUPPORTED = new Set(["live-preview","server-preview","page-composite","nonvisual","needs-preview"]);

function walk(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const file=join(dir,entry.name);
    if (entry.isDirectory()) return walk(file);
    return file.endsWith(".tsx") && !relative("components",file).startsWith("admin-")
      ? [file.replaceAll("\\","/")] : [];
  });
}

test("complete source inventory includes every public or shared component file exactly once", () => {
  const current=walk("components").sort();
  const paths=inventory.files.map((item)=>item.path).sort();
  assert.deepEqual(paths,current,
    "Source inventory is stale: update the file list, not the count alone");
  assert.equal(new Set(paths).size,paths.length);
  assert.equal(inventory.version,1);
  assert.equal(paths.length,166);
});

test("real visual previews and server examples are accounted for without mislabeling helper files", () => {
  const byPath=new Map(inventory.files.map((item)=>[item.path,item]));
  for (const item of inventory.files) {
    assert.ok(SUPPORTED.has(item.coverage),item.path);
    if (previewPaths.has(item.path)) {
      assert.equal(item.coverage,"live-preview",item.path);
    } else {
      assert.notEqual(item.coverage,"live-preview",item.path);
    }
  }
  assert.equal(byPath.get("components/public-visual-system/unified-section-hero.tsx").coverage,"server-preview");
  assert.equal(byPath.get("components/article-list-item.tsx").coverage,"server-preview");
  assert.equal(byPath.get("components/structured-data.tsx").coverage,"nonvisual");
  assert.equal(byPath.get("components/google-maps-consent-controls.tsx").coverage,"needs-preview");
  assert.equal(byPath.get("components/directory-profile-detail.tsx").coverage,"page-composite");
  assert.equal(byPath.get("components/article-feedback.tsx").coverage,"needs-preview");
  assert.equal(previewMatches.length,84);
  assert.equal(previewPaths.size,55);
});

test("owner can inspect every status, and missing previews cannot disappear from UI", () => {
  const ui=readFileSync("components/admin-visual-library-full-inventory.tsx","utf8");
  const catalog=readFileSync("components/admin-visual-library-visual-catalog.tsx","utf8");
  assert.match(ui,/inventory\.files\.map/);
  assert.match(ui,/needs-preview/);
  assert.match(ui,/nonvisual/);
  assert.match(ui,/page-composite/);
  assert.match(ui,/server-preview/);
  assert.match(ui,/live-preview/);
  assert.match(ui,/registry\.components/);
  assert.match(catalog,/<AdminVisualLibraryFullInventory registry=\{registry\}/);
  assert.doesNotMatch(ui,/method:\s*"(POST|PUT|DELETE)"|DB\.prepare|cloudflare:workers/);
});

test("extra samples render genuine components, with only artificial data and inert parent interactions", () => {
  const c=readFileSync("components/admin-visual-library-more-previews.tsx","utf8");
  for(const sym of [
    "BreedFciDisclosure","BreedPhoto","DirectoryOpeningHours","DogAgeCalculator",
    "EventImage","EventsBackLink","HelpReportGuide","HorizontalCarouselControls",
    "PublicFilterDisclosure","PublicProfileHero","RelatedEntityLinks",
  ]) assert.match(c,new RegExp("<"+sym+"\\b"));
  assert.doesNotMatch(c,/getPublished|\.prepare\(|cloudflare:workers|fetch\(|sessionStorage/);
});
