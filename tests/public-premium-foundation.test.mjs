import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const css = read("app/premium-foundation.css");

test("V2 loads after legacy public styles and excludes the Admin workspace", () => {
  const layout = read("app/layout.tsx");
  assert.ok(layout.indexOf('import "./premium-foundation.css";') > layout.indexOf('import "./navigation-loading.css";'));
  assert.match(css, /:root:not\(:has\(\[data-admin-workspace\]\)\)\s*\{/);
  assert.doesNotMatch(css, /(^|\n):root\s*\{/);
  assert.match(read("app/admin/layout.tsx"), /data-admin-workspace/);
  assert.doesNotMatch(read("app/admin/layout.tsx"), /premium-foundation/);
  assert.doesNotMatch(css, /!important\s*;/);
});

test("Premium V9 visual values have one scoped token source", () => {
  for (const [name, value] of Object.entries({
    "--forest": "#174d3a", "--coral": "#b44939", "--cream": "#f7f2e9",
    "--ps-premium-gradient-start": "#36735e", "--ps-premium-gradient-middle": "#235743",
    "--forest-dark": "#102f26", "--ps-radius-banner-large": "18px",
    "--ps-radius-banner-small": "16px", "--ps-radius-card": "14px",
    "--ps-radius-media": "10px", "--ps-radius-control": "9px",
  })) assert.ok(css.includes(name + ": " + value + ";"), name);
  assert.match(css, /linear-gradient\(115deg,[^;]*42%[^;]*100%\)/);
  assert.match(css, /--ps-premium-kicker-on-dark: var\(--cream\)/);
  assert.match(css, /--ps-reading-font: var\(--ps-font-body\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("Both fonts ship as local WOFF2 with licenses; no third-party font import", () => {
  for (const family of ["inter", "newsreader"]) {
    const path = "public/fonts/" + family + "-variable.woff2";
    const bytes = readFileSync(new URL("../" + path, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.ok(bytes.length > 1000);
    assert.match(read("public/fonts/" + family + "-OFL.txt"), /SIL OPEN FONT LICENSE/i);
    assert.ok(css.includes('url("/fonts/' + family + '-variable.woff2")'));
  }
  assert.doesNotMatch(css, /@import|https?:\/\//);
});

test("shared V2 components consume canonical typography and control tokens", () => {
  const shared = read("components/public-visual-system/public-visual-system.module.css");
  const forms = read("components/public-visual-system/public-form-controls.module.css");
  const headings = read("components/public-heading.module.css");
  const filters = read("components/public-filters.module.css");
  const article = read("components/public-visual-system/public-article-card.module.css");
  const details = read("components/detail-primitives/detail-primitives.module.css");
  const results = read("components/public-visual-system/public-result-states.module.css");
  assert.match(shared, /\.articleListMedia\s*\{[^}]*border-radius: var\(--ps-radius-media, 0\)/s);
  assert.match(shared, /\.articleListTitle\s*\{[^}]*font-family: var\(--ps-font-heading,/s);
  assert.match(shared, /\.action\s*\{[^}]*min-height: 44px[^}]*font-family: var\(--ps-font-body,/s);
  assert.match(shared, /\.actionPrimary\s*\{[^}]*box-shadow: var\(--ps-component-shadow,/s);
  assert.match(forms, /\.control\s*\{[^}]*min-height: var\(--ps-control-min-height, 44px\)[^}]*font-family: var\(--ps-font-body,/s);
  assert.match(forms, /aria-invalid="true"/);
  assert.match(forms, /forced-colors: active/);
  assert.match(headings, /@media \(max-width: 820px\)/);
  assert.match(headings, /font-family: var\(--ps-font-body,/);
  assert.match(filters, /min-height: var\(--ps-control-min-height, 44px\)/);
  assert.match(article, /\.card :global\(\.article-card-title\)\s*\{[^}]*font-family: var\(--ps-font-heading,/s);
  assert.match(details, /font-family: var\(--ps-font-body,/);
  assert.match(results, /border-radius: var\(--ps-radius-control, 10px\)/);
  assert.match(css, /--ps-ds5-card-hover-shadow: none/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*--ps-ds5-card-hover-transform: none/);
});
