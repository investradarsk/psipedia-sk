import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("desktop public map uses most of the viewport without making sidebar too wide", () => {
  const css = read("components/map/map-public.module.css");
  assert.match(css, /\.experience \{\s*width: min\(calc\(100% - 40px\), 1920px\)/);
  assert.match(css, /\.workspace \{[^}]*grid-template-columns: minmax\(280px, min\(32%, 420px\)\) minmax\(0, 1fr\)/);
  assert.match(css, /\.mapPanel \{[^}]*min-width: 0;/);
  assert.match(css, /\.rendererShell,[\s\S]*?\.googleMapCanvas,[\s\S]*?\.testMap \{[^}]*width: 100%/);
});

test("tablet and full-bleed mobile layouts are untouched", () => {
  const css = read("components/map/map-public.module.css");
  assert.match(css, /@media \(max-width: 1100px\) \{\s*\.experience \{\s*width: min\(calc\(100% - 32px\), 1180px\)/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.experience \{\s*width: 100%/);
  assert.match(css, /\.workspace \{[^}]*height: clamp\(620px, calc\(100dvh - 190px\), 840px\)/);
  assert.doesNotMatch(css, /position:\s*fixed;\s*width:\s*1920px/);
});
