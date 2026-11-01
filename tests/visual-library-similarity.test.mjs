import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  findSimilarityCandidates,
  normalizeSimilarText,
} from "../lib/visual-library-similarity.ts";

const make = (id, title, ctaHref, description = "Text", kind = "banner") => ({
  id, label: "Banner – " + id, title, description, ctaHref, kind,
});
const read = (name) => readFileSync(name, "utf8");

test("stage 5: a genuine shared destination produces a review candidate with a warning", () => {
  const entries = [
    make("clanky:chovatelske-kluby", "Hľadáte chovateľský klub?", "/adresar/chovatelske-kluby"),
    make("plemena:kluby", "Nájdi klub svojho plemena", "/adresar/chovatelske-kluby"),
    make("clanky:veterinari", "Hľadáte veterinára?", "/adresar/veterinari"),
  ];
  const hits = findSimilarityCandidates(entries);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].leftId, hits[0].rightId], [
    "clanky:chovatelske-kluby", "plemena:kluby",
  ]);
  assert.equal(hits[0].reason, "shared-target");
  assert.match(hits[0].explanation, /Nie je to potvrdená duplicita/);
});

test("stage 5: exact matching copy and target ranks above weak similarity", () => {
  const hits = findSimilarityCandidates([
    make("a", "Našli ste psa v núdzi?", "/pomoc-psom/nahlasit", "Postup"),
    make("b", "Našli ste psa v núdzi?", "/pomoc-psom/nahlasit", "Postup"),
    make("c", "Iný postup", "/pomoc-psom/nahlasit", "Všetko iné"),
  ]);
  assert.equal(hits[0].reason, "identical-copy-and-target");
  assert.equal(hits[0].score, 100);
  assert.equal(hits.length, 3);
});

test("stage 5: ordinary shared style, generic title or shared generic word are not duplicates", () => {
  const hits = findSimilarityCandidates([
    make("a", "Hľadáte veterinára?", "/adresar/veterinari"),
    make("b", "Hľadáte trénera?", "/adresar/treneri"),
    make("c", "Hľadáte psí salón?", "/adresar/salony"),
    make("d", "Hľadáte veterinára?", "/mapa", "Iný obsah", "cta"),
  ]);
  assert.deepEqual(hits, []);
  assert.equal(normalizeSimilarText("Veterinári – veterinári"), "veterinari veterinari");
});

test("stage 5: strongly similar meaningful titles with different destinations are suggestions only", () => {
  const hits = findSimilarityCandidates([
    make("a", "Klinika veterinárna pohotovosť liečba diagnostika rehabilitácia Nitra", "/a"),
    make("b", "Klinika veterinárna pohotovosť liečba diagnostika rehabilitácia Bratislava", "/b"),
  ]);
  assert.equal(hits[0]?.reason, "similar-title");
  assert.ok(hits[0]?.score < 85);
});

test("stage 5: pairs are unique, stable and bounded", () => {
  const input = [
    make("x", "Prvá", "/x"),
    make("x", "Prvá", "/x"),
    make("y", "Druhá", "/x"),
    make("z", "Tretia", "/x"),
  ];
  assert.equal(findSimilarityCandidates(input).length, 3);
  assert.equal(findSimilarityCandidates(input, 1).length, 1);
  assert.deepEqual(findSimilarityCandidates(input), findSimilarityCandidates(input));
});

test("stage 5: admin supports suggested and manual comparison with real previews and URLs", () => {
  const parent = read("components/admin-visual-library.tsx");
  const ui = read("components/admin-visual-library-duplicates.tsx");
  const banners = read("lib/visual-library-banners.ts");
  assert.match(parent, /"podobne", "Možné duplicity"/);
  assert.match(parent, /<AdminVisualLibraryDuplicates articleUsage=\{articleUsage\} examples=\{examples\}/);
  assert.match(ui, /findSimilarityCandidates/);
  assert.match(ui, /<PublicMagazineBanner/);
  assert.match(ui, /item\.example\?\.preview/);
  assert.match(ui, /item\.uses\.slice\(0, showCount\)/);
  assert.match(ui, /Otvoriť umiestnenie/);
  assert.match(ui, /navigator\.clipboard\.writeText/);
  assert.match(ui, /Ni[cč] sa samo/);
  assert.match(banners, /chovatelske-kluby/);
});
