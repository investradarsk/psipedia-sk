import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("directory, events, help and breeds display removable URL-backed active filters", () => {
  const directory = read("components/directory-filter-form.tsx");
  const events = read("components/event-listing-results.tsx");
  const help = read("components/help-browser.tsx");
  const breeds = read("components/breed-browser.tsx");
  const design = read("app/design-system.css");
  for (const [name, src] of [
    ["directory", directory],
    ["events", events],
    ["help", help],
    ["breeds", breeds],
  ]) {
    assert.match(src, /<PublicActiveFilters|data-public-active-filters/, name);
    assert.match(src, /<PublicFilterTag[^>]*href=\{\s*clearOneHref\(\s*key\s*\)\s*\}/, name);
    if (name === "help") {
      // The shared panel header is the single reset destination for Help.
      assert.match(src, /<PublicFilterPanel\s+title="Filtrovať pomoc"\s+resetHref=\{basePath\}/);
    } else {
      assert.match(src, /data-public-filter-reset/, name);
    }
  }
  assert.match(
    design,
    /\[\s*data-public-active-filters\s*\]\s*\[\s*data-public-filter-reset\s*\]\s*\{\s*/,
  );
  assert.match(design, /min-height:\s*var\(\s*--ps-control-min-height,\s*44px\s*\)/);
  assert.match(design, /@media\s*\(\s*forced-colors:\s*active\s*\)\s*\{\s*/);
});

test("event remove links preserve native params and handle category/period semantics", () => {
  const events = read("components/event-listing-results.tsx");
  assert.match(events, /const\s*next\s*=\s*new\s*URLSearchParams\(\s*params\s*\)/);
  assert.match(events, /next\s*\.delete\(\s*key\s*\)/);
  assert.match(events, /key\s*===\s*"typ"\s*\?\s*"\/podujatia"\s*:\s*pathname/);
  assert.match(
    events,
    /if\s*\(\s*key\s*===\s*"termin"\s*\)\s*next\s*\.set\(\s*"termin",\s*"vsetky"\s*\)/,
  );
  assert.match(events, /key:\s*"zoradenie"/);
  assert.match(events, /<details\s*className=\{\s*styles\s*\.mobileFilters\s*\}>/);
  const css = read("components/events-public.module.css");
  assert.match(css, /\s*\.mobileFilters\s*>\s*summary:focus-visible/);
  assert.match(css, /min-height:\s*var\(\s*--ps-control-min-height,\s*44px\s*\)/);
});

test("help chips preserve other GET filters and breed chips reset dependent FCI section", () => {
  const help = read("components/help-browser.tsx");
  assert.match(
    help,
    /if\s*\(\s*query\s*&&\s*key\s*!==\s*"q"\s*\)\s*next\s*\.set\(\s*"q",\s*query\s*\)/,
  );
  assert.match(
    help,
    /if\s*\(\s*region\s*!==\s*"all"\s*&&\s*key\s*!==\s*"region"\s*\)\s*next\s*\.set\(\s*"region",\s*region\s*\)/,
  );
  assert.match(
    help,
    /if\s*\(\s*!activeOnly\s*&&\s*key\s*!==\s*"stav"\s*\)\s*next\s*\.set\(\s*"stav",\s*"vsetky"\s*\)/,
  );
  const breed = read("components/breed-browser.tsx");
  assert.match(breed, /breedAtlasHref\(\s*\{\s*/);
  assert.match(breed, /key\s*===\s*"fciGroup"\s*\?\s*\{\s*fciSection:\s*""\s*\}/);
  assert.match(breed, /<Link\s*href="\/plemena"\s*data-public-filter-reset>/);
  assert.match(breed, /aria-pressed=\{\s*selectedGroup\s*===/);
  const page = read("app/plemena/page.tsx");
  assert.match(page, /<BreedBrowser\s*key=\{\s*breedAtlasHref\(\s*initialFilters\s*\)\s*\}/);
  const directory = read("components/directory-filter-form.tsx");
  assert.match(directory, /key\s*===\s*"region"\s*\?\s*\[\s*"region",\s*"district",\s*"city"\s*\]/);
  assert.match(directory, /key\s*===\s*"district"\s*\?\s*\[\s*"district",\s*"city"\s*\]/);
  assert.match(directory, /<dialog\s*id="directory-filter-dialog"/);
  assert.match(directory, /method="get"/);
});
