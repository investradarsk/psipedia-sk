import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("the public link component forwards native Next Link a11y and data attributes", () => {
  const shared = read("components/public-visual-system/public-visual-system.tsx");
  assert.match(shared, /Omit<ComponentProps<typeof Link>, "href" \| "children" \| "icon" \| "variant" \| "target" \| "rel">/);
  assert.match(shared, /"data-testid"\?: string;/);
  assert.match(shared, /<Link \{\.\.\.linkProps\} className=/);
  assert.match(shared, /data-public-action=\{variant\}/);
  const css = read("components/public-visual-system/public-visual-system.module.css");
  assert.match(css, /\.action \{[\s\S]*?border-radius: var\(--ps-radius-control, 12px\)/);
  assert.match(css, /\.action:focus-visible\s*\{/);
});

test("breed FCI detail, article promo and editorial continuation use shared semantic links", () => {
  const breed = read("app/plemena/[slug]/page.tsx");
  const breedCss = read("app/plemena/[slug]/breed-profile.module.css");
  assert.match(breed, /<PublicActionLink[\s\S]*?data-testid="breed-fci-cta"[\s\S]*?<\/PublicActionLink>/);
  assert.match(breedCss, /\.primaryLink \{ width: fit-content; margin-top: 4px; \}/);
  assert.doesNotMatch(breedCss, /\.primaryLink:hover/);
  const promo = read("components/article-promo.tsx");
  assert.match(promo, /<PublicActionLink className=\{styles.cta\} variant="secondary" href=\{target.href\} aria-label=/);
  assert.match(promo, /icon=\{<ArrowIcon size=\{16\} \/>\}/);
  const continuation = read("components/article-continuation.tsx");
  assert.match(continuation, /<PublicActionLink href=\{next.href\} variant="tertiary"/);
  assert.match(continuation, /\{next.label\}/);
});

test("editorial banners and content use a common visual rhythm without changing photos", () => {
  const article = read("components/article-detail.module.css");
  const promo = read("components/article-promo.module.css");
  const continuation = read("components/article-continuation.module.css");
  const help = read("components/public-visual-system/public-help-banner.module.css");
  assert.match(article, /\.articleLayout \{[\s\S]*?padding-inline: 0;/);
  assert.match(continuation, /max-width: var\(--ps-content-max, 1180px\);/);
  assert.match(promo, /border-radius: var\(--ps-banner-radius, var\(--ps-radius-filter, 18px\)\)/);
  assert.doesNotMatch(promo, /\.cta:hover|\.cta:focus-visible|\.arrow \{/);
  assert.match(help, /\.reportBanner a \{flex:0 0 auto\}/);
  assert.doesNotMatch(help, /\.reportBanner a:hover/);
  assert.match(help, /\.overviewPromo_care \{background-image:url/);
  assert.match(help, /\.closingCta \{min-height:330px;background-image/);
});
