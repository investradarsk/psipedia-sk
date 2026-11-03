import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("five public detail families share one controlled type and facts hierarchy", () => {
  const base = read("app/design-system.css");
  const detail = read("components/detail-primitives/detail-primitives.module.css");
  const article = read("components/article-detail.module.css");
  const breed = read("app/plemena/[slug]/breed-profile.module.css");
  const event = read("components/events-public.module.css");
  for (const name of ["heading-size", "fact-label-size", "fact-value-size", "photo-radius"]) {
    assert.match(base, new RegExp("--ps-detail-" + name + ":"));
  }
  assert.match(detail, /\s*\.section\s*h2\s*\{\s*[^}]*var\(\s*--ps-detail-heading-size\s*\)/);
  assert.match(detail, /\s*\.factTiles\s*dt\s*\{\s*[^}]*var\(\s*--ps-detail-fact-label-size\s*\)/);
  assert.match(detail, /\s*\.factTiles\s*dd\s*\{\s*[^}]*var\(\s*--ps-detail-fact-value-size\s*\)/);
  assert.match(
    breed,
    /\s*\.readingSection\s*h2,\s*\.sectionIntro\s*h2[^}]*var\(\s*--ps-detail-heading-size\s*\)/,
  );
  assert.match(
    breed,
    /\s*\.factGrid\s*dt,\s*\.fciFacts\s*dt[^}]*var\(\s*--ps-detail-fact-label-size\s*\)/,
  );
  assert.match(
    breed,
    /\s*\.factGrid\s*dd,\s*\.fciFacts\s*dd[^}]*var\(\s*--ps-detail-fact-value-size\s*\)/,
  );
  assert.match(
    event,
    /\s*\.detailCopy\s*section\s*>\s*h2\s*\{\s*[^}]*var\(\s*--ps-detail-heading-size\s*\)/,
  );
  assert.match(event, /\s*\.detailFacts\s*dt\s*\{\s*[^}]*var\(\s*--ps-detail-fact-label-size\s*\)/);
  assert.match(event, /\s*\.detailFacts\s*dd\s*\{\s*[^}]*var\(\s*--ps-detail-fact-value-size\s*\)/);
  assert.match(
    article,
    /\s*\.readingShell\s*:global\(\s*\.article-blocks\s*h2\s*\)\s*\{\s*[^}]*var\(\s*--ps-detail-heading-size\s*\)/,
  );
});

test("article and breed retain intrinsic/contained photos, help safety styling is not modified", () => {
  const base = read("app/design-system.css");
  const detail = read("components/detail-primitives/detail-primitives.module.css");
  const breed = read("app/plemena/[slug]/breed-profile.module.css");
  const article = read("components/article-detail.module.css");
  assert.match(base, /--ps-detail-photo-radius:\s*var\(\s*--ps-radius-media\s*\)/);
  assert.match(
    detail,
    /\s*\.heroMedia\s*\{\s*border:\s*1px\s*solid\s*var\(\s*--detail-border\s*\);\s*border-radius:\s*var\(\s*--ps-detail-photo-radius\s*\)/,
  );
  assert.match(
    breed,
    /\s*\.heroPhoto\s*\{\s*border-radius:\s*var\(\s*--ps-detail-photo-radius\s*\);\s*\}/,
  );
  assert.match(breed, /object-fit:\s*contain/);
  assert.match(
    article,
    /\s*\.modernArticle\s*\.heroMedia\s*\.heroNatural\s*\{\s*aspect-ratio:\s*auto/,
  );
  assert.match(article, /object-fit:\s*contain/);
  assert.doesNotMatch(
    read("components/help-details/help-detail.module.css"),
    /--ps-detail-heading-size/,
    "safety panels keep own emphasis",
  );
});
