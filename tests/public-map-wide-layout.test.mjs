import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("desktop public map, controls and provider information align with the canonical page shell", () => {
  const css = read("components/map/map-public.module.css");
  const experience = read("components/map/map-experience.tsx");
  const globals = read("app/globals.css");

  assert.match(
    globals,
    /\s*\.shell\s*\{\s*width:\s*min\(\s*var\(\s*--ps-content-max\s*\),\s*calc\(\s*100%\s*-\s*48px\s*\)\s*\)/,
  );
  assert.match(
    experience,
    /<section\s*className=\{\s*\`shell\s*public-shell\s*\$\{\s*styles\s*\.experience\s*\}\`\s*\}/,
  );
  assert.match(
    experience,
    /className=\{\s*\`shell\s*public-shell\s*\$\{\s*styles\s*\.providerDisclosure\s*\}\`\s*\}/,
  );
  assert.doesNotMatch(css, /1920px/, "the map must not be wider than the canonical content shell");
  assert.doesNotMatch(css, /\s*\.experience\s*\{\s*[^}]*\swidth\s*:/g);
  assert.doesNotMatch(css, /\s*\.providerDisclosure\s*\{\s*[^}]*\bwidth\s*:/g);
  assert.match(
    css,
    /\s*\.workspace\s*\{\s*[^}]*grid-template-columns:\s*minmax\(\s*280px,\s*min\(\s*32%,\s*420px\s*\)\s*\)\s*minmax\(\s*0,\s*1fr\s*\)/,
  );
  assert.match(css, /\s*\.mapPanel\s*\{\s*[^}]*min-width:\s*0;/);
});

test("map filters follow existing public control dimensions without changing filter behavior", () => {
  const css = read("components/map/map-public.module.css");
  const experience = read("components/map/map-experience.tsx");

  assert.match(
    css,
    /\s*\.searchField\s*\{\s*[^}]*min-height:\s*var\(\s*--ps-control-min-height,\s*44px\s*\)/,
  );
  assert.match(
    css,
    /\s*\.secondaryFilters\s*select,\s*\.secondaryFilters\s*input\s*\{\s*[^}]*min-height:\s*var\(\s*--ps-control-min-height,\s*44px\s*\)/,
  );
  assert.match(
    css,
    /\s*\.workspace\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-card,\s*22px\s*\)/,
  );
  assert.match(experience, /mapFiltersForCategory\(\s*filters,\s*/);
  assert.match(
    experience,
    /<FilterFields\s*filters=\{\s*filters\s*\}\s*onChange=\{\s*updateFilters\s*\}\s*\/>/,
  );
});

test("mobile map canvas remains immersive while toolbar and disclosure stay in the shared gutter", () => {
  const css = read("components/map/map-public.module.css");
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*760px\s*\)\s*\{\s*[\s\S]*?\s*\.workspace\s*\{\s*width:\s*100dvw;\s*margin-inline:\s*calc\(\s*\(\s*100%\s*-\s*100dvw\s*\)\s*\/\s*2\s*\)/,
  );
  assert.match(
    css,
    /\s*\.workspace\s*\{\s*[^}]*height:\s*clamp\(\s*620px,\s*calc\(\s*100dvh\s*-\s*190px\s*\),\s*840px\s*\)/,
  );
  assert.match(
    css,
    /\s*\.rendererShell,\s*[\s\S]*?\s*\.googleMapCanvas,\s*[\s\S]*?\s*\.testMap\s*\{\s*[^}]*width:\s*100%/,
  );
  assert.doesNotMatch(css, /position:\s*fixed;\s*width:\s*1920px/);
});
