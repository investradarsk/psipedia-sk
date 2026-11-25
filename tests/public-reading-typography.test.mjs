import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const foundation = read("app/design-system.css");
const articles = read("components/article-detail.module.css");
const breeds = read("app/plemena/[slug]/breed-profile.module.css");
const details = read("components/detail-primitives/detail-primitives.module.css");
const events = read("components/event-detail.tsx");
const directory = read("components/directory-profile-detail.tsx");

test("long-form reading values have one canonical public token source", () => {
  for (const token of [
    "font",
    "size",
    "lead-size",
    "leading",
    "color",
    "heading-color",
    "measure",
    "paragraph-gap",
  ]) {
    assert.match(foundation, new RegExp("--ps-reading-" + token + ":"));
  }
  assert.match(foundation, /--ps-reading-size:\s*0\.9375rem;/);
  assert.match(foundation, /--ps-reading-lead-size:\s*1rem;/);
  assert.match(foundation, /--ps-reading-leading:\s*1\.55;/);
  assert.match(foundation, /--ps-reading-paragraph-gap:\s*0\.75rem;/);
  assert.match(foundation, /--ps-reading-measure:\s*70ch/);
  assert.match(foundation, /--ps-reading-color:\s*var\(--ink-2\)/);
});

test("articles share green high-contrast prose, legible mobile size and reading measure", () => {
  assert.match(
    articles,
    /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*max-width:\s*var\(--ps-reading-measure\)/s,
  );
  assert.match(
    articles,
    /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*font-family:\s*var\(--ps-reading-font\)/s,
  );
  assert.match(
    articles,
    /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*font-size:\s*var\(--ps-reading-size\)/s,
  );
  assert.match(
    articles,
    /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*line-height:\s*var\(--ps-reading-leading\)/s,
  );
  assert.match(
    articles,
    /\.readingShell :global\(\.article-blocks h2\),\s*\.readingShell :global\(\.article-blocks h3\)[^{]*\{[^}]*color:\s*var\(--ps-reading-heading-color\)/s,
  );
  const mobile = articles.slice(articles.indexOf("@media (max-width: 767px)"));
  assert.match(
    mobile,
    /\.readingShell :global\(\.article-prose\)[^{]*\{[^}]*font-size:\s*var\(--ps-reading-size\)/s,
  );
  assert.doesNotMatch(
    mobile,
    /\.readingShell :global\(\.article-prose\)\s*\{[^}]*font-size:\s*16px/s,
  );
});

test("breeds and all shared profile details consume the same reading scale", () => {
  assert.match(breeds, /\.page \.prose\s*\{[^}]*font-size:\s*var\(--ps-reading-size\)/s);
  assert.match(breeds, /\.page \.prose\s*\{[^}]*line-height:\s*var\(--ps-reading-leading\)/s);
  assert.match(breeds, /\.page \.prose p \+ p\s*\{[^}]*var\(--ps-reading-paragraph-gap\)/s);
  assert.match(details, /\.section p\s*\{[^}]*font-size:\s*var\(--ps-reading-size\)/s);
  assert.match(details, /\.section p\s*\{[^}]*line-height:\s*var\(--ps-reading-leading\)/s);
  assert.match(details, /\.section :global\(\.event-markdown li\)/);
  assert.match(events, /<DetailSection compactHeading title="O podujatí">/);
  assert.match(directory, /<DetailSection/);
});

test("informational pages opt into readability without globally enlarging controls or admin", () => {
  assert.match(
    foundation,
    /\.prose-page:is\(\.legal-page, \.info-page\)[\s\S]*?font-family:\s*var\(--ps-reading-font\)/,
  );
  assert.doesNotMatch(read("app/admin/admin-editorial-foundation.css"), /--ps-reading-size/);
  const globals = read("app/globals.css");
  assert.match(globals, /body\s*\{[^}]*font-family:\s*var\(--ps-font-body,\s*"Avenir Next"/s);
  const premium = read("app/premium-foundation.css");
  assert.match(premium, /:root:not\(:has\(\[data-admin-workspace\]\)\)\s*\{[^}]*--ps-font-body:\s*"Psipedia Inter"/s);
  assert.match(premium, /--ps-reading-font:\s*var\(--ps-font-body\)/);
});

test("Typography V1 shares semantic roles across public cards, profiles and Partner without changing mobile article prose", () => {
  const premium = read("app/premium-foundation.css");
  const tokens = {
    "article-desktop": "1.1875rem",
    "article-lead-desktop": "1.25rem",
    profile: "1rem",
    compact: ".875rem",
    "sidebar-title": ".9375rem",
    meta: ".75rem",
    control: ".875rem",
    input: "1rem",
  };
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(premium.includes("--ps-type-" + name + ": " + value + ";"), name);
  }
  assert.ok(premium.includes("--ps-type-card-heading: 1rem;"));
  assert.ok(premium.includes("--ps-type-card-heading: 1.125rem;"));
  const desktopReading = articles.match(/@media \(min-width: 801px\)\s*\{\s*\.modernArticle \.readingShell\s*\{([^}]+)\}/);
  assert.ok(desktopReading, "article override must be desktop-only");
  assert.ok(desktopReading[1].includes("var(--ps-type-article-desktop"));
  assert.ok(desktopReading[1].includes("var(--ps-type-article-lead-desktop"));
  assert.doesNotMatch(premium, /--ps-reading-size:\s*var\(--ps-type-article-desktop/);
  for (const file of [
    "components/public-heading.module.css",
    "components/detail-primitives/detail-primitives.module.css",
    "components/organization-profile-detail.module.css",
    "components/help-details/help-detail.module.css",
    "app/plemena/[slug]/breed-profile.module.css",
    "components/public-visual-system/public-visual-system.module.css",
    "app/partner/partner.css",
  ]) {
    assert.ok(read(file).includes("var(--ps-type-card-heading"), file);
  }
  for (const file of [
    "components/article-popularity-sidebar.module.css",
    "components/related-entity-list.module.css",
    "app/home-v2.module.css",
  ]) {
    const css = read(file);
    assert.ok(css.includes("var(--ps-type-sidebar-title"), file);
    assert.ok(css.includes("var(--ps-type-meta"), file);
  }
  const partner = read("app/partner/partner.css");
  assert.ok(partner.includes("var(--ps-type-input"));
  assert.ok(partner.includes("var(--ps-type-control"));
  assert.doesNotMatch(read("app/admin/admin-editorial-foundation.css"), /--ps-type-/);
});
