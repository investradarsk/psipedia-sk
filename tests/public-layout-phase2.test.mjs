import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public listing headings use one typography contract across major sections", () => {
  const design = read("app/design-system.css");
  assert.match(design, /--ps-list-heading-size:\s*clamp\(\s*1\s*\.5rem,\s*2\s*\.4vw,\s*2rem\s*\)/);
  assert.match(design, /--ps-list-heading-leading:\s*1\s*\.15/);
  for (const [path, selector] of [
    ["components/public-visual-system/public-landing-layout.module.css", "\\.heading h2"],
    ["components/directory-public.module.css", "\\.resultsHeading h2"],
    ["components/help-public.module.css", "\\.resultHeading h2"],
    ["components/events-public.module.css", "\\.listingLayout \\.listHeading h2"],
    [
      "app/plemena/breed-atlas.module.css",
      "\\.foundation :global\\(\\.breed-crawl-index-intro h2\\)",
    ],
  ]) {
    const css = read(path);
    assert.match(
      css,
      new RegExp(selector + " \\{[^}]*font-size: var\\(--ps-list-heading-size\\)"),
      path,
    );
  }
  // Novinky migrated to the shared PublicSectionHeader; the removed archiveHeader h2 does not exist.
  const newsHub = read("components/news-hub.tsx");
  const sharedHeader = read("components/public-visual-system/public-visual-system.module.css");
  assert.match(newsHub, /<PublicSectionHeader/);
  assert.match(sharedHeader, /\.headerCompact h1,[\s\S]*?font-size: var\(--pv-type-data-heading/);
});

test("layout follows shared shell and centralizes listing gaps and search panel widths", () => {
  const design = read("app/design-system.css");
  const global = read("app/globals.css");
  assert.match(
    global,
    /\s*\.shell\s*\{\s*width:\s*min\(\s*var\(\s*--ps-content-max\s*\),\s*calc\(\s*100%\s*-\s*48px\s*\)\s*\)/,
  );
  for (const token of [
    "--ps-list-column-gap:",
    "--ps-list-section-top:",
    "--ps-list-search-max:",
  ]) {
    assert.ok(design.includes(token), token);
  }
  const files = [
    "components/directory-public.module.css",
    "components/help-public.module.css",
    "components/events-public.module.css",
    "app/plemena/breed-atlas.module.css",
  ];
  for (const path of files)
    assert.match(
      read(path),
      /var\(\s*--ps-list-search-max\s*\)|var\(\s*--ps-list-column-gap\s*\)/,
      path,
    );
  const events = read("components/events-public.module.css");
  assert.doesNotMatch(
    events,
    /\s*\.detailPage\s*\.relatedSection\s*:global\(\s*\.shell\s*\)\s*\{\s*[^}]*1120px/,
  );
  assert.match(
    events,
    /\s*\.listingLayout\s*\{\s*[^}]*margin-top:\s*var\(\s*--ps-list-section-top\s*\)/,
  );
  assert.match(
    read("components/news-hub.module.css"),
    /\s*\.archive\s*\{\s*[^}]*padding-block:\s*var\(\s*--ps-list-section-top\s*\)/,
  );
  assert.match(
    read("app/clanky/article-listing.module.css"),
    /gap:\s*var\(\s*--ps-ds5-grid-gap,\s*16px\s*\)/,
  );
});

test("small screens retain shared gutters, readable content and distinct map canvas", () => {
  const design = read("app/design-system.css");
  const layouts = read("components/public-visual-system/public-landing-layout.module.css");
  const directory = read("components/directory-public.module.css");
  const events = read("components/events-public.module.css");
  const breeds = read("app/plemena/breed-atlas.module.css");
  assert.match(
    design,
    /@media\s*\(\s*max-width:\s*620px\s*\)\s*\{\s*[^}]*--ps-list-column-gap:\s*14px/s,
  );
  assert.match(
    layouts,
    /@media\s*\(\s*max-width:\s*700px\s*\)\s*\{\s*[^}]*grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\)/s,
  );
  assert.match(
    directory,
    /@media\s*\(\s*max-width:\s*820px\s*\)\s*\{\s*[^}]*\s*\.directoryColumns\s*\{\s*grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\)/s,
  );
  assert.match(
    events,
    /@media\s*\(\s*max-width:\s*760px\s*\)\s*\{\s*[^}]*\s*\.listingLayout\s*\{\s*[^}]*grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\)/s,
  );
  assert.match(
    breeds,
    /@media\s*\(\s*max-width:\s*760px\s*\)\s*\{\s*[^}]*\s*\.foundation\s*:global\(\s*\.browser-toolbar\s*\)\s*\{\s*[^}]*grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\)/s,
  );
  assert.match(
    read("components/map/map-public.module.css"),
    /\s*\.workspace\s*\{\s*[^}]*grid-template-columns:/s,
  );
});
