import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("desktop public map, controls and provider information align with the canonical page shell", () => {
  const css = read("components/map/map-public.module.css");
  const experience = read("components/map/map-experience.tsx");
  const globals = read("app/globals.css");

  assert.match(globals, /\.shell\s*\{\s*width: min\(var\(--ps-content-max\), calc\(100% - 48px\)\)/);
  assert.match(experience, /<section className=\{\`shell public-shell \$\{styles\.experience\}\`\}/);
  assert.match(experience, /className=\{\`shell public-shell \$\{styles\.providerDisclosure\}\`\}/);
  assert.doesNotMatch(css, /1920px/, "the map must not be wider than the canonical content shell");
  assert.doesNotMatch(css, /\.experience\s*\{[^}]*\bwidth\s*:/g);
  assert.doesNotMatch(css, /\.providerDisclosure\s*\{[^}]*\bwidth\s*:/g);
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns: minmax\(280px, min\(32%, 420px\)\) minmax\(0, 1fr\)/);
  assert.match(css, /\.mapPanel\s*\{[^}]*min-width: 0;/);
});

test("map filters follow existing public control dimensions without changing filter behavior", () => {
  const css = read("components/map/map-public.module.css");
  const experience = read("components/map/map-experience.tsx");

  assert.match(css, /\.searchField\s*\{[^}]*min-height: var\(--ps-control-min-height, 44px\)/);
  assert.match(css, /\.secondaryFilters select,\s*\.secondaryFilters input\s*\{[^}]*min-height: var\(--ps-control-min-height, 44px\)/);
  assert.match(css, /\.workspace\s*\{[^}]*border-radius: var\(--ps-radius-card, 22px\)/);
  assert.match(experience, /mapFiltersForCategory\(filters,/);
  assert.match(experience, /<FilterFields filters=\{filters\} onChange=\{updateFilters\} \/>/);
});

test("mobile map canvas remains immersive while toolbar and disclosure stay in the shared gutter", () => {
  const css = read("components/map/map-public.module.css");
  assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.workspace\s*\{\s*width: 100dvw;\s*margin-inline: calc\(\(100% - 100dvw\) \/ 2\)/);
  assert.match(css, /\.workspace\s*\{[^}]*height: clamp\(620px, calc\(100dvh - 190px\), 840px\)/);
  assert.match(css, /\.rendererShell,[\s\S]*?\.googleMapCanvas,[\s\S]*?\.testMap\s*\{[^}]*width: 100%/);
  assert.doesNotMatch(css, /position:\s*fixed;\s*width:\s*1920px/);
});
