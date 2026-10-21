import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public action states read from the shared search/CTA semantic palette", () => {
  const css = read("components/public-visual-system/public-visual-system.module.css");
  const tokens = read("app/design-system.css");
  const actions = css.slice(css.indexOf(".actionPrimary {"), css.indexOf(".loadingIndicator {"));
  assert.match(tokens, /--ps-color-action-primary: var\(--forest\);/);
  assert.match(tokens, /--ps-color-action-primary-hover: var\(--forest-dark\);/);
  assert.match(tokens, /--ps-color-action-primary-text: var\(--white\);/);
  assert.match(actions, /\.actionPrimary\s*\{[^}]*border-color: var\(--ps-color-action-primary\);[^}]*color: var\(--ps-color-action-primary-text\);[^}]*background: var\(--ps-color-action-primary\);/s);
  assert.match(actions, /\.actionPrimary:hover:not\(:disabled\)\s*\{[^}]*background: var\(--ps-color-action-primary-hover\);/s);
  assert.match(actions, /\.actionPrimary:active:not\(:disabled\)\s*\{[^}]*background: var\(--ps-color-action-primary-hover\);/s);
  assert.match(actions, /\.actionSecondary/);
  assert.match(actions, /\.actionTertiary/);
  assert.match(css, /animation: publicActionSpin .8s linear infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("contextual banner geometry references the existing common radius", () => {
  const banner = read("components/public-visual-system/public-context-banner.module.css");
  const tokens = read("app/design-system.css");
  assert.match(tokens, /--ps-radius-filter: 18px;/);
  assert.match(banner, /--ps-banner-radius: var\(--ps-radius-filter, 18px\);/);
  assert.match(banner, /border-radius: var\(--ps-banner-radius, 18px\);/);
  assert.match(banner, /\.inline > \.copy/);
  assert.match(banner, /min-height: 48px;/);
});
