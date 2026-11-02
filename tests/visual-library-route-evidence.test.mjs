import assert from "node:assert/strict";
import test from "node:test";
import { collectPinnedStaticRoutePlacements } from "../lib/visual-library-route-evidence.ts";

const pages = [
  { id: "homepage:profile", label: "Pridajte profil", uses: [
    { url: "https://psipedia.sk/", label: "Homepage", placement: "Pod článkami", anchorId: "psipedia-banner-home-profile" },
    { url: "https://psipedia.sk/", label: "Homepage", placement: "Pod článkami", anchorId: "psipedia-banner-home-profile" },
  ] },
  { id: "help:adoption", label: "Adopcia", uses: [
    { url: "https://psipedia.sk/pomoc-psom", label: "Pomoc", placement: "Adopcia" },
    { url: "https://psipedia.sk/pomoc-psom/adopcia/example", label: "Detail", placement: "Detail" },
  ] },
  { id: "wrong:host", label: "Zlá URL", uses: [
    { url: "https://other.example/", label: "Wrong host", placement: "Podvod" },
    { url: "https://psipedia.sk.evil.example/", label: "Wrong host", placement: "Podvod" },
    { url: "https://psipedia.sk/?tracking=yes", label: "With query", placement: "Iné" },
  ] },
];
const examples = [
  { id: "hero:home", label: "Hero", category: "hero", uses: [
    { url: "https://psipedia.sk/", label: "Homepage", placement: "Hero", anchorId: "psipedia-hero-home" },
  ] },
  { id: "cta:help", label: "CTA", category: "cta", uses: [
    { url: "https://psipedia.sk/pomoc-psom", label: "Pomoc", placement: "V hlavičke", anchorId: "psipedia-help-cta" },
  ] },
];

test("exact pinned static route yields anchored placement provenance and deduplicates repeats", () => {
  const rows = collectPinnedStaticRoutePlacements("/", pages, examples);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.source), ["visual-example", "banner-catalogue"]);
  assert.deepEqual(rows.map(row => row.category), ["hero", "banner"]);
  assert.deepEqual(rows.map(row => row.anchorId), ["psipedia-hero-home", "psipedia-banner-home-profile"]);
  assert.ok(rows.every(row => row.url === "https://psipedia.sk/"));
});

test("dynamic template routes and similar but unverified URLs never receive evidence", () => {
  for (const route of [
    "/pomoc-psom/adopcia/[slug]", "/plemena/[slug]", "/admin",
    "/admin/komponenty", "//other.example", "/pomoc-psom/adopcia", "/?x=1",
  ]) {
    assert.deepEqual(collectPinnedStaticRoutePlacements(route, pages, examples), []);
  }
  assert.deepEqual(collectPinnedStaticRoutePlacements("/pomoc-psom", pages, examples)
    .map(row => row.id), ["help:adoption", "cta:help"]);
});

test("unvalidated anchors cannot produce unsafe fragments, even with trusted route", () => {
  const bad = [{ id: "example", label: "A", uses: [{
    url: "https://psipedia.sk/", placement: "top", label: "A", anchorId: "unsafe#anchor?go",
  }] }];
  assert.deepEqual(collectPinnedStaticRoutePlacements("/", bad, []), [{
    id: "example", visualLabel: "A", category: "banner",
    url: "https://psipedia.sk/", anchorId: undefined,
    placement: "top", source: "banner-catalogue",
  }]);
});
