import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("directory V9 card rules are scoped and preserve missing photos and multi-category data", () => {
  const css = read("components/directory-public.module.css");
  const v2 = css.slice(css.indexOf("/* V2-08:"));
  assert.match(v2, /\.card\[data-public-card="directory"\][^{}]*\{[^}]*var\(--ps-radius-card\)/s);
  assert.match(v2, /\.card\[data-public-card="directory"\] \.cardImage[^}]*var\(--ps-radius-media\)/s);
  assert.match(v2, /\.card\[data-public-card="directory"\] \.cardTitle[^}]*var\(--ps-font-heading\)[^}]*overflow-wrap: anywhere/s);
  assert.doesNotMatch(v2, /event-grid|!important/);
  const card = read("components/directory-card.tsx");
  assert.match(card, /directoryProfileCategoryLabels\(profile\)/);
  assert.match(card, /<PublicMediaFallback/);
});
test("profile conditional data, mobile ordering and narrow service layout remain intact", () => {
  const source = read("components/directory-profile-detail.tsx");
  const keys = ["intro","contact","expertise","catalog-attributes","services","hours","map","profile-gallery","reviews","nearby"];
  const offsets = keys.map(key => source.indexOf('key: "' + key + '"'));
  assert.ok(offsets.every((n,i) => n >= 0 && (i === 0 || n > offsets[i-1])));
  assert.match(source, /directoryProfileCategoryLabels\(presentation\)/);
  assert.match(source, /<PublicMediaFallback/);
  assert.match(source, /data-public-contact-empty/);
  assert.match(source, /presentation\.openingHours \? \(/);
  assert.match(read("components/directory-profile-detail.module.css"), /@media \(max-width: 360px\)\s*\{\s*\.servicesColumns\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(read("components/directory-filter-form.module.css"), /border-radius: var\(--ps-radius-control\)/);
});
