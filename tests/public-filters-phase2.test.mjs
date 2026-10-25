import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("directory, events, help and breeds display removable URL-backed active filters", () => {
  const directory = read("components/directory-filter-form.tsx");
  const events = read("components/event-listing-results.tsx");
  const help = read("components/help-browser.tsx");
  const breeds = read("components/breed-browser.tsx");
  const design = read("app/design-system.css");
  for (const [name, src] of [["directory", directory], ["events", events], ["help", help], ["breeds", breeds]]) {
    assert.match(src, /data-public-active-filters/, name);
    assert.match(src, /<PublicFilterTag[^>]*href=\{clearOneHref\(key\)\}/, name);
    assert.match(src, /data-public-filter-reset/, name);
  }
  assert.match(design, /\[data-public-active-filters\] \[data-public-filter-reset\] \{/);
  assert.match(design, /min-height: var\(--ps-control-min-height, 44px\)/);
  assert.match(design, /@media \(forced-colors: active\) \{/);
});

test("event remove links preserve native params and handle category/period semantics", () => {
  const events = read("components/event-listing-results.tsx");
  assert.match(events, /const next = new URLSearchParams\(params\)/);
  assert.match(events, /next\.delete\(key\)/);
  assert.match(events, /key === "typ" \? "\/podujatia" : pathname/);
  assert.match(events, /if \(key === "termin"\) next\.set\("termin", "vsetky"\)/);
  assert.match(events, /key: "zoradenie"/);
  assert.match(events, /<details className=\{styles\.mobileFilters\}>/);
  const css = read("components/events-public.module.css");
  assert.match(css, /\.mobileFilters > summary:focus-visible/);
  assert.match(css, /min-height: var\(--ps-control-min-height, 44px\)/);
});

test("help chips preserve other GET filters and breed chips reset dependent FCI section", () => {
  const help = read("components/help-browser.tsx");
  assert.match(help, /if \(query && key !== "q"\) next\.set\("q", query\)/);
  assert.match(help, /if \(region !== "all" && key !== "region"\) next\.set\("region", region\)/);
  assert.match(help, /if \(!activeOnly && key !== "stav"\) next\.set\("stav", "vsetky"\)/);
  const breed = read("components/breed-browser.tsx");
  assert.match(breed, /breedAtlasHref\(\{/);
  assert.match(breed, /key === "fciGroup" \? \{ fciSection: "" \}/);
  assert.match(breed, /<a href="\/plemena" data-public-filter-reset>/);
  assert.match(breed, /aria-pressed=\{selectedGroup ===/);
  const directory = read("components/directory-filter-form.tsx");
  assert.match(directory, /key === "region" \? \["region", "district", "city"\]/);
  assert.match(directory, /key === "district" \? \["district", "city"\]/);
  assert.match(directory, /<dialog id="directory-filter-dialog"/);
  assert.match(directory, /method="get"/);
});
