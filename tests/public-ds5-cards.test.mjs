import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const design = read("app/design-system.css");
const globals = read("app/globals.css");
const directory = read("components/directory-public.module.css");
const help = read("components/help-public.module.css");
const adoption = read("components/adoption.module.css");
const events = read("components/events-public.module.css");

const start = "/* DS-5 PUBLIC CARDS, GRIDS & MEDIA START";
const end = "/* DS-5 PUBLIC CARDS, GRIDS & MEDIA END */";

test("DS-5 is one isolated extension using the approved shared geometry", () => {
  assert.equal(design.split(start).length, 2, "one DS-5 start marker");
  assert.equal(design.split(end).length, 2, "one DS-5 end marker");
  const ds5 = design.slice(design.indexOf(start), design.indexOf(end) + end.length);
  assert.match(ds5, /--ps-ds5-grid-gap:\s*16px;/);
  assert.match(ds5, /--ps-ds5-card-padding:\s*18px;/);
  assert.match(ds5, /border-radius:\s*var\(--ps-radius-card\);/);
  assert.match(ds5, /--ps-ds5-grid-gap:\s*12px;/);
  assert.match(ds5, /--ps-ds5-card-padding:\s*14px;/);
  assert.match(design, /--ps-radius-card:\s*22px;/);
  assert.match(design, /--ps-radius-card:\s*18px;/);
  assert.doesNotMatch(ds5, /(?:\.hero|\.admin|\/admin|--ps-radius-media):?/i);
});

test("editorial articles and breeds retain distinct image ratios with shared 3/2/1 grids", () => {
  const ds5 = design.slice(design.indexOf(start), design.indexOf(end));
  assert.match(ds5, /\.article-card--grid\s+\.article-card-media\s*\{\s*aspect-ratio:\s*3\s*\/\s*2;/);
  assert.doesNotMatch(ds5, /\.article-card--featured\s+\.article-card-media/);
  assert.match(globals, /\.breed-card-media\s*\{[\s\S]*?aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(globals, /\.article-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(3/);
  assert.match(ds5, /@media\s*\(max-width:\s*1020px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(ds5, /@media\s*\(max-width:\s*620px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(ds5, /prefers-reduced-motion:\s*reduce/);
  assert.match(ds5, /:has\(a:focus-visible\)/);
});

test("directory, help and adoption cards follow compact shell and intentional media sizes", () => {
  for (const [kind, css] of [["directory", directory], ["help", help], ["adoption", adoption]]) {
    const ds5 = css.slice(css.lastIndexOf("/* DS-5"));
    assert.ok(ds5.startsWith("/* DS-5"), kind + " dedicated extension");
    assert.match(ds5, /border-radius:\s*var\(--ps-radius-card,\s*22px\)/, kind);
    assert.match(ds5, /--ps-ds5-card-padding/, kind);
  }
  assert.match(directory, /\.directoryColumns \.cardImage\s*\{\s*width:\s*80px;\s*height:\s*80px;/);
  assert.match(directory.slice(directory.lastIndexOf("/* DS-5")), /\.cardImage\s*\{[\s\S]*?aspect-ratio:\s*1;/);
  assert.match(directory.slice(directory.lastIndexOf("/* DS-5")), /@media\s*\(max-width:\s*620px\)[\s\S]*?width:\s*68px;\s*height:\s*68px;/);
  assert.match(adoption, /\.visual\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(help, /\.media\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(adoption, /\.imageFallback\s*\{/);
  assert.match(help, /\.mediaFallback\s*\{/);
});

test("event listing retains category art and remains two-column at 768px", () => {
  const ds5 = events.slice(events.lastIndexOf("/* DS-5"));
  assert.match(ds5, /\.gridCard\s*\{[\s\S]*?border-radius:\s*var\(--ps-radius-card,\s*22px\)/);
  assert.match(ds5, /min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)/);
  assert.match(ds5, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(events, /Illustrations keep their original framing/);
  assert.match(events, /aspect-ratio:\s*16\s*\/\s*10;/);
  assert.match(events, /@media\s*\(max-width:\s*760px\)/);
});

test("existing non-destructive image renderers, fallbacks and keyboard contracts stay intact", () => {
  const article = read("components/article-card.tsx");
  const breed = read("components/breed-card.tsx");
  const directoryCard = read("components/directory-card.tsx");
  const helpCard = read("components/help-card.tsx");
  const eventCard = read("components/event-card.tsx");
  const adoptionMedia = read("components/adoption-card-media.tsx");
  const imageDisplay = read("components/image-display.tsx");
  const smart = read("components/smart-card-image.tsx");
  assert.match(article, /<ImageDisplay/);
  assert.match(article, /article-placeholder/);
  assert.match(breed, /<BreedPhoto/);
  assert.match(breed, /breed-card-placeholder/);
  assert.match(directoryCard, /<ImageDisplay/);
  assert.match(helpCard, /<ImageDisplay/);
  assert.match(eventCard, /<EventImage/);
  assert.match(adoptionMedia, /<ImageDisplay/);
  assert.match(adoptionMedia, /imageFallback/);
  assert.match(imageDisplay, /<SmartCardImage/);
  assert.match(smart, /objectPosition:\s*.*focus\.x/);
  assert.match(smart, /objectFit:\s*fit/);
  assert.match(events, /\.gridCardLink:focus-visible/);
});

test("DS-5 shared effects resolve to the approved values for every existing card variant", () => {
  const ds5 = design.slice(design.indexOf(start), design.indexOf(end));
  const tokens = new Map([...design.matchAll(/(--[\w-]+):\s*([^;{}]+);/g)].map((match) => [match[1], match[2].trim()]));
  const resolve = (value) => value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(tokens.has(name), `unresolved shared card token ${name}`);
    return resolve(tokens.get(name));
  });
  // --ps-shadow-surface intentionally retains the existing global shadow source.
  tokens.set("--shadow-sm", "0 8px 28px rgba(23, 53, 43, 0.08)");
  tokens.set("--forest", "#174b38");
  const values = {
    "--ps-ds5-card-shadow": "0 5px 17px rgba(23, 53, 43, 0.045)",
    "--ps-ds5-card-transition": "transform 180ms ease, box-shadow 180ms ease",
    "--ps-ds5-card-hover-transform": "translateY(-2px)",
    "--ps-ds5-card-hover-shadow": "0 8px 28px rgba(23, 53, 43, 0.08)",
    "--ps-ds5-card-focus-outline": "3px solid #174b38",
    "--ps-ds5-card-focus-offset": "2px",
  };
  for (const [name, expected] of Object.entries(values)) {
    assert.equal(resolve(`var(${name})`), expected, `${name} keeps the approved value`);
    assert.equal([...ds5.matchAll(new RegExp(`${name}:`, "g"))].length, 1, `${name} has one owner`);
  }
  for (const [kind, css] of [["editorial", ds5], ["directory", directory], ["help", help], ["adoption", adoption], ["events", events]]) {
    const extension = kind === "editorial" ? css : css.slice(css.lastIndexOf("/* DS-5"));
    assert.match(extension, /box-shadow:\s*var\(--ps-ds5-card-shadow\)/, kind);
    if (kind !== "directory") {
      assert.match(extension, /transition:\s*var\(--ps-ds5-card-transition\)/, kind);
      assert.match(extension, /transform:\s*var\(--ps-ds5-card-hover-transform\)/, kind);
      assert.match(extension, /box-shadow:\s*var\(--ps-ds5-card-hover-shadow\)/, kind);
      assert.match(extension, /prefers-reduced-motion:\s*reduce[\s\S]*transition:\s*none/, kind);
    }
  }
});

test("organization cards retain their approved central variant instead of inheriting DS-5 geometry", () => {
  const css = read("app/organizacie/organization-hub.module.css");
  for (const [name, value] of [
    ["grid-gap", "1.25rem"], ["radius", "1.25rem"], ["padding", "1.15rem"],
    ["shadow", "0 12px 28px rgba(20, 44, 36, 0.06)"],
  ]) {
    assert.ok(design.includes(`--ps-card-organization-${name}: ${value};`));
    assert.ok(css.includes(`var(--ps-card-organization-${name})`));
  }
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

// Public visual consistency regressions run within the established DS-5 suite.
import "./public-map-wide-layout.test.mjs";
import "./public-listing-card-consistency.test.mjs";
import "./public-visual-consistency-actions.test.mjs";
import "./public-detail-visual-consistency.test.mjs";
import "./public-editorial-detail-consistency.test.mjs";

// Phase 2, fixed item 1: public detail appearance regressions.
import "./public-details-phase2.test.mjs";

// Phase 2, fixed item 2: banner and notice consistency.
import "./public-banners-phase2.test.mjs";
