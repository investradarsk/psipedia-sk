import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("banner frames have one shared source across contextual, homepage and article variants", () => {
  const design = read("app/design-system.css");
  const context = read("components/public-visual-system/public-context-banner.module.css");
  const magazine = read("components/public-visual-system/public-magazine-banner.module.css");
  const editorial = read("components/article-promo.module.css");
  const help = read("components/public-visual-system/public-help-banner.module.css");
  assert.match(design, /--ps-banner-radius: var\(--ps-radius-filter\)/);
  assert.match(design, /--ps-banner-border: var\(--ps-border-soft\)/);
  assert.match(context, /border: 1px solid var\(--ps-banner-border/);
  assert.match(context, /border-radius: var\(--ps-banner-radius/);
  assert.match(magazine, /border: 1px solid var\(--ps-banner-border/);
  assert.match(magazine, /border-radius: var\(--ps-banner-radius/);
  assert.match(editorial, /border: 1px solid var\(--ps-banner-border/);
  assert.match(editorial, /border-radius: var\(--ps-banner-radius/);
  assert.match(help, /\.reportBanner \{[\s\S]*?border-radius: var\(--ps-banner-radius/);
  assert.match(help, /\.closingCta \{[^}]*background-image:/);
  assert.match(help, /\.overviewPromo_care \{background-image:/);
});

test("public notices share banner geometry and have separate informational, warning and error palettes", () => {
  const css = read("components/public-visual-system/public-result-states.module.css");
  const source = read("components/public-visual-system/public-result-states.tsx");
  const notice = css.slice(css.indexOf(".notice {"), css.indexOf(".filterTag {"));
  assert.match(notice, /border-radius: var\(--ps-banner-radius/);
  assert.match(notice, /border: 1px solid var\(--ps-banner-border/);
  assert.match(notice, /overflow-wrap: anywhere/);
  assert.match(notice, /\.success \{[^}]*background: var\(--sage-light/);
  assert.match(notice, /\.warning \{[^}]*border-left-color: var\(--gold/);
  assert.match(notice, /\.error \{[^}]*border-left-color: var\(--brand-accent-strong/);
  assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*?\.notice \{/);
  assert.match(source, /role = tone === "error" \? "alert" : "status"/);
  assert.match(source, /data-public-notice=\{tone\}/);
  assert.match(source, /appearance === "default" && styles\[tone\]/);
});

test("the compact/foto banner variants keep their own responsive layouts and destinations", () => {
  const context = read("components/public-visual-system/public-context-banner.tsx");
  const css = read("components/public-visual-system/public-context-banner.module.css");
  const help = read("components/public-visual-system/public-help-banner.tsx");
  assert.match(context, /hasImage && styles\.hasImage/);
  assert.match(context, /data-public-context-banner-layout=\{inline \? "inline" : "stacked"\}/);
  assert.match(context, /<PublicActionLink href=\{ctaHref!\}/);
  assert.match(css, /\.tone_forest \{/);
  assert.match(css, /\.tone_coral \{/);
  assert.match(css, /\.inline > \.copy \{/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(help, /href="\/pomoc-psom\/nahlasit-psa-v-nudzi"/);
  assert.match(help, /href="\/pomoc-psom\/dobrovolnictvo"/);
});
