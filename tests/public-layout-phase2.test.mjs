import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public listing headings use one typography contract across major sections", () => {
  const design = read("app/design-system.css");
  assert.match(design, /--ps-list-heading-size: clamp\(1\.5rem, 2\.4vw, 2rem\)/);
  assert.match(design, /--ps-list-heading-leading: 1\.15/);
  for (const [path,selector] of [
    ["components/public-visual-system/public-landing-layout.module.css", "\\.heading h2"],
    ["components/directory-public.module.css", "\\.resultsHeading h2"],
    ["components/help-public.module.css", "\\.resultHeading h2"],
    ["components/events-public.module.css", "\\.listingLayout \\.listHeading h2"],
    ["app/plemena/breed-atlas.module.css", "\\.foundation :global\\(\\.breed-crawl-index-intro h2\\)"],
    ["components/news-hub.module.css", "\\.archiveHeader h2"],
  ]) {
    const css = read(path);
    assert.match(css,new RegExp(selector+" \\{[^}]*font-size: var\\(--ps-list-heading-size\\)"),path);
  }
});

test("layout follows shared shell and centralizes listing gaps and search panel widths", () => {
  const design = read("app/design-system.css");
  const global = read("app/globals.css");
  assert.match(global, /\.shell \{\s*width: min\(var\(--ps-content-max\), calc\(100% - 48px\)\)/);
  for (const token of ["--ps-list-column-gap:","--ps-list-section-top:","--ps-list-search-max:"]) {
    assert.ok(design.includes(token),token);
  }
  const files = [
    "components/directory-public.module.css",
    "components/help-public.module.css",
    "components/events-public.module.css",
    "app/plemena/breed-atlas.module.css",
  ];
  for (const path of files) assert.match(read(path), /var\(--ps-list-search-max\)|var\(--ps-list-column-gap\)/,path);
  const events=read("components/events-public.module.css");
  assert.doesNotMatch(events,/\.detailPage \.relatedSection :global\(\.shell\) \{[^}]*1120px/);
  assert.match(events,/\.listingLayout \{[^}]*margin-top: var\(--ps-list-section-top\)/);
  assert.match(read("components/news-hub.module.css"),/\.archive \{[^}]*padding-block: var\(--ps-list-section-top\)/);
  assert.match(read("app/clanky/article-listing.module.css"),/gap: var\(--ps-ds5-grid-gap, 16px\)/);
});

test("small screens retain shared gutters, readable content and distinct map canvas", () => {
  const design = read("app/design-system.css");
  const layouts = read("components/public-visual-system/public-landing-layout.module.css");
  const directory = read("components/directory-public.module.css");
  const events = read("components/events-public.module.css");
  const breeds = read("app/plemena/breed-atlas.module.css");
  assert.match(design, /@media \(max-width: 620px\) \{[^}]*--ps-list-column-gap: 14px/s);
  assert.match(layouts, /@media \(max-width: 700px\) \{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(directory, /@media \(max-width: 820px\) \{[^}]*\.directoryColumns \{ grid-template-columns: minmax\(0,1fr\)/s);
  assert.match(events, /@media \(max-width: 760px\) \{[^}]*\.listingLayout \{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(breeds, /@media \(max-width: 760px\) \{[^}]*\.foundation :global\(\.browser-toolbar\) \{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(read("components/map/map-public.module.css"),/\.workspace \{[^}]*grid-template-columns:/s);
});
