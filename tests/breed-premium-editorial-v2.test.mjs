import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("breed atlas uses scoped premium group headers and unclipped factual labels", () => {
  const css = read("app/plemena/breed-atlas.module.css");
  assert.match(css, /background: var\(--ps-premium-gradient\)/);
  assert.match(css, /border-inline-start: var\(--ps-premium-accent-width\) solid var\(--ps-premium-accent\)/);
  assert.match(css, /\.breed-card-classification\)[\s\S]*?white-space: normal;[\s\S]*?overflow: visible/);
  assert.match(css, /\.breed-card-body > p\)[\s\S]*?-webkit-line-clamp: unset/);
});

test("breed detail, standard and comparison use the shared V2 fonts and radii", () => {
  for (const path of [
    "app/plemena/[slug]/breed-profile.module.css",
    "app/plemena/[slug]/fci-standard/fci-standard.module.css",
    "app/porovnat-plemena/comparison.module.css",
  ]) {
    const css = read(path);
    assert.doesNotMatch(css, /Georgia|Avenir Next/);
    assert.match(css, /var\(--ps-font-heading\)/);
    assert.match(css, /var\(--ps-font-body\)/);
    assert.match(css, /var\(--ps-radius-card\)/);
  }
  const comparison = read("app/porovnat-plemena/comparison.module.css");
  assert.match(comparison, /max-height: none;\s*overflow: visible;/);
  assert.doesNotMatch(comparison, /width: 42px; height: 42px/);
});

test("mobile facts and related articles still follow about, before ratings", () => {
  const page = read("app/plemena/[slug]/page.tsx");
  const positions = ['id="breed-about"', 'data-testid="breed-quick-facts-mobile"', 'className={styles.mobileRelatedArticles}', 'id="hodnotenia"'].map(s => page.indexOf(s));
  assert.ok(positions.every((n, i) => n >= 0 && (i === 0 || n > positions[i - 1])));
  assert.match(page, /<DetailFactsCard title="Plemeno v skratke"/);
  assert.match(page, /<PublicPhotoGallery/);
});
