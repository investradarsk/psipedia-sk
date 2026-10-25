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
  assert.match(detail, /\.section h2 \{[^}]*var\(--ps-detail-heading-size\)/);
  assert.match(detail, /\.factTiles dt \{[^}]*var\(--ps-detail-fact-label-size\)/);
  assert.match(detail, /\.factTiles dd \{[^}]*var\(--ps-detail-fact-value-size\)/);
  assert.match(breed, /\.readingSection h2, \.sectionIntro h2[^}]*var\(--ps-detail-heading-size\)/);
  assert.match(breed, /\.factGrid dt, \.fciFacts dt[^}]*var\(--ps-detail-fact-label-size\)/);
  assert.match(breed, /\.factGrid dd, \.fciFacts dd[^}]*var\(--ps-detail-fact-value-size\)/);
  assert.match(event, /\.detailCopy section > h2 \{[^}]*var\(--ps-detail-heading-size\)/);
  assert.match(event, /\.detailFacts dt \{[^}]*var\(--ps-detail-fact-label-size\)/);
  assert.match(event, /\.detailFacts dd \{[^}]*var\(--ps-detail-fact-value-size\)/);
  assert.match(article, /\.readingShell :global\(\.article-blocks h2\) \{[^}]*var\(--ps-detail-heading-size\)/);
});

test("article and breed retain intrinsic/contained photos, help safety styling is not modified", () => {
  const base = read("app/design-system.css");
  const detail = read("components/detail-primitives/detail-primitives.module.css");
  const breed = read("app/plemena/[slug]/breed-profile.module.css");
  const article = read("components/article-detail.module.css");
  assert.match(base, /--ps-detail-photo-radius: var\(--ps-radius-media\)/);
  assert.match(detail, /\.heroMedia \{ border: 1px solid var\(--detail-border\); border-radius: var\(--ps-detail-photo-radius\)/);
  assert.match(breed, /\.heroPhoto \{ border-radius: var\(--ps-detail-photo-radius\); \}/);
  assert.match(breed, /object-fit: contain/);
  assert.match(article, /\.modernArticle \.heroMedia\.heroNatural \{ aspect-ratio: auto/);
  assert.match(article, /object-fit: contain/);
  assert.doesNotMatch(read("components/help-details/help-detail.module.css"), /--ps-detail-heading-size/, "safety panels keep own emphasis");
});
