import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("directory, events and help detail shells reuse the public content gutter", () => {
  const css = read("components/detail-primitives/detail-primitives.module.css");
  const directory = read("components/directory-profile-detail.module.css");
  const globals = read("app/globals.css");
  assert.match(
    globals,
    /\s*\.shell\s*\{\s*width:\s*min\(\s*var\(\s*--ps-content-max\s*\),\s*calc\(\s*100%\s*-\s*48px\s*\)\s*\)/,
  );
  assert.match(
    css,
    /\s*\.shell\s*\{\s*width:\s*min\(\s*var\(\s*--ps-content-max,\s*1180px\s*\),\s*calc\(\s*100%\s*-\s*48px\s*\)\s*\)/,
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*620px\s*\)\s*\{\s*\.shell\s*\{\s*width:\s*min\(\s*100%\s*-\s*24px,\s*520px\s*\)/,
  );
  assert.match(
    directory,
    /\s*\.contactSection\s*\{\s*width:\s*min\(\s*var\(\s*--ps-content-max,\s*1180px\s*\),\s*calc\(\s*100%\s*-\s*48px\s*\)\s*\)/,
  );
  assert.match(
    directory,
    /@media\s*\(\s*max-width:\s*620px\s*\)\s*\{\s*\.contactSection\s*\{\s*width:\s*min\(\s*100%\s*-\s*24px,\s*520px\s*\)/,
  );
});

test("shared detail cards and actions use the current public visual palette", () => {
  const css = read("components/detail-primitives/detail-primitives.module.css");
  assert.match(css, /--detail-ink:\s*var\(\s*--ink\s*\);/);
  assert.match(css, /--detail-green:\s*var\(\s*--forest\s*\);/);
  assert.match(css, /--detail-radius:\s*var\(\s*--ps-radius-card\s*\);/);
  assert.match(css, /\s*\.heroFrame\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-card\s*\)/);
  assert.match(
    css,
    /\s*\.section,\s*\.card\s*\{\s*border-radius:\s*var\(\s*--ps-radius-card\s*\);\s*\}/,
  );
  assert.match(
    css,
    /\s*\.primaryAction\s*\{\s*color:\s*var\(\s*--white\s*\);\s*background:\s*var\(\s*--forest\s*\)/,
  );
  assert.match(
    css,
    /\s*\.secondaryAction\s*\{\s*color:\s*var\(\s*--forest-dark\s*\);\s*background:\s*var\(\s*--white\s*\)/,
  );
  assert.match(css, /border-radius:\s*var\(\s*--ps-radius-control\s*\)/);
});

test("help informational banner follows shared banner radius without changing safety warning", () => {
  const css = read("components/help-details/help-detail.module.css");
  assert.match(css, /\s*\.trust\s*\{\s*border-radius:\s*var\(\s*--ps-radius-filter,\s*18px\s*\)/);
  assert.match(css, /\s*\.safety\s*\{\s*background:\s*#fff7e4;\s*border-color:\s*#f5dba4;\s*\}/);
});

test("section hero search delegates button palette to the canonical shared CTA", () => {
  const heroCss = read("components/public-visual-system/unified-section-hero.module.css");
  const actionCss = read("components/public-visual-system/public-visual-system.module.css");
  const search = read("components/section-hero-search.tsx");
  assert.match(
    search,
    /<PublicActionButton\s*type="submit">\{\s*buttonLabel\s*\}<\/PublicActionButton>/,
  );
  assert.match(
    actionCss,
    /\s*\.actionPrimary\s*\{\s*[^}]*background:\s*var\(\s*--ps-color-action-primary\s*\)/,
  );
  assert.match(
    actionCss,
    /\s*\.action\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-control,\s*12px\s*\)/,
  );
  assert.doesNotMatch(heroCss, /var\(\s*--ps-color-action-primary/);
});
