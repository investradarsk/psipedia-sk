import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findVisualSourceCandidates } from "../lib/visual-library-source-comparison.ts";

const component = (name, path, routes, styleModules = [], area = "public") =>
  ({ name, label:name, path, routes, styleModules, area });

test("related source components show shared routes and direct CSS module evidence, not false duplicates", () => {
  const entries = [
    component("unified-hero", "components/unified-hero.tsx",
      ["/", "/plemena", "/plemena/[slug]"], ["components/unified-hero.module.css"]),
    component("legacy-hero", "components/legacy-hero.tsx",
      ["/plemena", "/kontakt"], ["components/legacy-hero.module.css"]),
    component("admin-hero", "components/admin-hero.tsx", ["/admin"], [], "admin"),
  ];
  const groups = [{
    id:"hero", title:"Hlavičky", description:"Spoločné účely hlavičiek",
    paths: entries.map(x => x.path),
  }];
  const hits = findVisualSourceCandidates(entries, groups);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].reason, "related-purpose");
  assert.equal(hits[0].score, 78);
  assert.deepEqual(hits[0].sharedRoutes, ["/plemena"]);
  assert.deepEqual(hits[0].affectedRoutes, ["/", "/kontakt", "/plemena", "/plemena/[slug]"]);
  assert.deepEqual(hits[0].leftStyleModules, ["components/legacy-hero.module.css"]);
  assert.deepEqual(hits[0].rightStyleModules, ["components/unified-hero.module.css"]);
  assert.match(hits[0].explanation, /nie o potvrdenú duplicitu/);
  assert.match(hits[0].explanation, /rôzne CSS moduly/);
});

test("same name in distinct public files is a candidate, not a source deduplication action", () => {
  const entries = [
    component("card", "components/cards/card.tsx", ["/clanky"]),
    component("card", "components/help/card.tsx", ["/pomoc-psom"]),
    component("card", "components/admin/card.tsx", ["/admin"], [], "admin"),
    component("unrelated", "components/unrelated.tsx", ["/clanky"]),
  ];
  const hits = findVisualSourceCandidates(entries, []);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].reason, "same-name");
  assert.equal(hits[0].score, 100);
  assert.deepEqual(hits[0].sharedRoutes, []);
  assert.deepEqual(hits[0].affectedRoutes, ["/clanky", "/pomoc-psom"]);
  assert.match(hits[0].explanation, /Neznamená to rovnaké vykreslenie/);
});

test("ignore self-pairs, stale group paths, duplicate references and private admin routes", () => {
  const one = component("hero","components/hero.tsx",["/admin", "/clanky","/clanky"]);
  const two = component("heading","components/heading.tsx",["/admin/xxx","/clanky"]);
  const hits = findVisualSourceCandidates([one,two],[
    { id:"hero", title:"Heads", description:"Similar", paths:[one.path,one.path,two.path,"not-found"] },
    { id:"hero2", title:"Heads 2", description:"Other", paths:[one.path,two.path] },
  ]);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].sharedRoutes, ["/clanky"]);
  assert.deepEqual(hits[0].affectedRoutes, ["/clanky"]);
  assert.equal(findVisualSourceCandidates([one,two],[],0).length, 0);
  assert.deepEqual(findVisualSourceCandidates([one,two],[]), []);
});

test("user-facing duplicate tab includes cross-component comparison, impact and CSS evidence, never auto-merge", () => {
  const ui = readFileSync("components/admin-visual-library-source-similarity.tsx","utf8");
  const parent = readFileSync("components/admin-visual-library-duplicates.tsx","utf8");
  const registry = readFileSync("scripts/generate-component-registry.mjs","utf8");
  assert.match(ui, /findVisualSourceCandidates/);
  assert.match(ui, /chosen\.affectedRoutes/);
  assert.match(ui, /chosen\.sharedRoutes/);
  assert.match(ui, /chosen\.leftStyleModules/);
  assert.match(ui, /<AdminComponentVisualPreview id=\{selectedPreview\.id\}/);
  assert.match(ui, /adminComponentPreviewSamples\.filter/);
  assert.match(ui, /previews\.length > 1/);
  assert.match(ui, /publicRegistryRouteHref\(route\)/);
  assert.match(ui, /Žiadne automatické zlučovanie/);
  assert.match(parent, /<AdminVisualLibrarySourceSimilarity registry=\{registry\}/);
  assert.match(registry, /styleModules: styleImports\.get\(file\)/);
});
