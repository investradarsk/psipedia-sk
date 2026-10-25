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

test("section hero search delegates button palette to the canonical shared CTA", () => {
  const heroCss = read("components/public-visual-system/unified-section-hero.module.css");
  const actionCss = read("components/public-visual-system/public-visual-system.module.css");
  const search = read("components/section-hero-search.tsx");
  assert.match(search, /<PublicActionButton type="submit">\{buttonLabel\}<\/PublicActionButton>/);
  assert.match(actionCss, /\.actionPrimary \{[^}]*background: var\(--ps-color-action-primary\)/);
  assert.match(actionCss, /\.action \{[^}]*border-radius: var\(--ps-radius-control, 12px\)/);
  assert.doesNotMatch(heroCss, /var\(--ps-color-action-primary/);
});
