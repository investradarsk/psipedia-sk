import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");

test("directory, events and help detail shells reuse the public content gutter", () => {
  const css = read("components/detail-primitives/detail-primitives.module.css");
  const directory = read("components/directory-profile-detail.module.css");
  const globals = read("app/globals.css");
  assert.match(globals, /\.shell\s*\{\s*width: min\(var\(--ps-content-max\), calc\(100% - 48px\)\)/);
  assert.match(css, /\.shell \{ width: min\(var\(--ps-content-max, 1180px\), calc\(100% - 48px\)\)/);
  assert.match(css, /@media \(max-width: 620px\) \{\s*\.shell \{ width: min\(100% - 24px, 520px\)/);
  assert.match(directory, /\.contactSection \{ width: min\(var\(--ps-content-max, 1180px\), calc\(100% - 48px\)\)/);
  assert.match(directory, /@media \(max-width: 620px\) \{ \.contactSection \{ width: min\(100% - 24px, 520px\)/);
});

test("shared detail cards and actions use the current public visual palette", () => {
  const css = read("components/detail-primitives/detail-primitives.module.css");
  assert.match(css, /--detail-ink: var\(--ink\);/);
  assert.match(css, /--detail-green: var\(--forest\);/);
  assert.match(css, /--detail-radius: var\(--ps-radius-card\);/);
  assert.match(css, /\.heroFrame \{[^}]*border-radius: var\(--ps-radius-card\)/);
  assert.match(css, /\.section, \.card \{ border-radius: var\(--ps-radius-card\); \}/);
  assert.match(css, /\.primaryAction \{ color: var\(--white\); background: var\(--forest\)/);
  assert.match(css, /\.secondaryAction \{ color: var\(--forest-dark\); background: var\(--white\)/);
  assert.match(css, /border-radius: var\(--ps-radius-control\)/);
});

test("help informational banner follows shared banner radius without changing safety warning", () => {
  const css=read("components/help-details/help-detail.module.css");
  assert.match(css, /\.trust \{ border-radius: var\(--ps-radius-filter, 18px\)/);
  assert.match(css, /\.safety \{ background: #fff7e4; border-color: #f5dba4; \}/);
});

test("section hero CTA respects existing design token adoption boundaries", () => {
  const css=read("components/public-visual-system/unified-section-hero.module.css");
  const button=css.slice(css.indexOf(".hero :global([data-section-hero-search] button) {"), css.indexOf(".hero :global([data-section-hero-search] :is"));
  assert.match(button,/color: var\(--white, #fff\)/);
  assert.match(button,/background: var\(--forest, #174b38\)/);
  assert.doesNotMatch(button,/var\(--ps-color-action-primary/);
});
