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
  assert.match(foundation, /--ps-reading-leading:\s*1\.72/);
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
