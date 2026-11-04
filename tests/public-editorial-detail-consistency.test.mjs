import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("the public link component forwards native Next Link a11y and data attributes", () => {
  const shared = read("components/public-visual-system/public-visual-system.tsx");
  assert.match(
    shared,
    /Omit<\s*ComponentProps<typeof\s*Link>,\s*"href"\s*\|\s*"children"\s*\|\s*"icon"\s*\|\s*"variant"\s*\|\s*"target"\s*\|\s*"rel"\s*>/,
  );
  assert.match(shared, /"data-testid"\?:\s*string;/);
  assert.match(shared, /<Link\s*\{\s*\.\s*\.\s*\.linkProps\s*\}\s*className=/);
  assert.match(shared, /data-public-action=\{\s*variant\s*\}/);
  const css = read("components/public-visual-system/public-visual-system.module.css");
  assert.match(
    css,
    /\s*\.action\s*\{\s*[\s\S]*?border-radius:\s*var\(\s*--ps-radius-control,\s*12px\s*\)/,
  );
  assert.match(css, /\s*\.action:focus-visible\s*\{\s*/);
});

test("breed FCI detail, article promo and editorial continuation use shared semantic links", () => {
  const breed = read("app/plemena/[slug]/page.tsx");
  const breedCss = read("app/plemena/[slug]/breed-profile.module.css");
  assert.match(
    breed,
    /<PublicActionLink[\s\S]*?data-testid="breed-fci-cta"[\s\S]*?<\/PublicActionLink>/,
  );
  assert.match(breedCss, /\s*\.primaryLink\s*\{\s*width:\s*fit-content;\s*margin-top:\s*4px;\s*\}/);
  assert.doesNotMatch(breedCss, /\s*\.primaryLink:hover/);
  const promo = read("components/article-promo.tsx");
  assert.match(promo, /<PublicMagazineBanner/);
  assert.match(promo, /href=\{\s*target.href\s*\}/);
  assert.match(promo, /promoKey=\{\s*promoKey\s*\}/);
  const shared = read("components/public-visual-system/public-magazine-banner.tsx");
  assert.match(
    shared,
    /<PublicActionLink[\s\S]*?href=\{\s*href\s*\}[\s\S]*?className="button\s*button--dark"/,
  );
  const continuation = read("components/article-continuation.tsx");
  assert.match(continuation, /<PublicActionLink\s*href=\{\s*next.href\s*\}\s*variant="tertiary"/);
  assert.match(continuation, /\{\s*next.label\s*\}/);
});

test("editorial banners and content use a common visual rhythm without changing photos", () => {
  const article = read("components/article-detail.module.css");
  const promo = read("components/article-promo.module.css");
  const continuation = read("components/article-continuation.module.css");
  const help = read("components/public-visual-system/public-help-banner.module.css");
  assert.match(article, /\s*\.articleLayout\s*\{\s*[\s\S]*?padding-inline:\s*0;/);
  assert.match(continuation, /max-width:\s*var\(\s*--ps-content-max,\s*1180px\s*\);/);
  assert.match(
    promo,
    /border-radius:\s*var\(\s*--ps-banner-radius,\s*var\(\s*--ps-radius-filter,\s*18px\s*\)\s*\)/,
  );
  assert.doesNotMatch(promo, /\s*\.cta:hover|\s*\.cta:focus-visible|\s*\.arrow\s*\{\s*/);
  assert.match(help, /\s*\.reportBanner\s*a\s*\{\s*flex:0\s*0\s*auto\s*\}/);
  assert.doesNotMatch(help, /\s*\.reportBanner\s*a:hover/);
  assert.match(help, /\s*\.overviewPromo_care\s*\{\s*background-image:url/);
  assert.match(help, /\s*\.closingCta\s*\{\s*min-height:330px;background-image/);
});
