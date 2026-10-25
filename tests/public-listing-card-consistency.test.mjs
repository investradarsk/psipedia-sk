import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("five public content card families opt in to one visible design contract", () => {
  const components = [
    ["components/article-card.tsx", 'data-public-card="article"'],
    ["components/breed-card.tsx", 'data-public-card="breed"'],
    ["components/directory-card.tsx", 'data-public-card="directory"'],
    ["components/help-card.tsx", 'data-public-card="help"'],
    ["components/event-card.tsx", 'data-public-card="event-grid"'],
    ["components/event-card.tsx", 'data-public-card="event-list"'],
  ];
  for (const [path, marker] of components) {
    const source = read(path);
    assert.ok(source.includes(marker), path + " must opt in");
    assert.match(source, /data-public-card-title/, path + " title");
    assert.match(source, /data-public-card-meta/, path + " metadata");
  }
});

test("public cards share stateful surfaces but keep urgency and original media", () => {
  const css = read("app/design-system.css");
  const rules = css.slice(css.indexOf("/* PUBLIC-VISUAL-CONSISTENCY:"));
  assert.match(rules, /\[data-public-card\]\[data-public-card\]\s*\{[^}]*border-radius: var\(--ps-radius-card\)/);
  assert.match(rules, /box-shadow: var\(--ps-ds5-card-shadow\)/);
  assert.match(rules, /:hover\s*\{[^}]*transform: var\(--ps-ds5-card-hover-transform\)/);
  assert.match(rules, /:has\(a:focus-visible\)/);
  assert.match(rules, /:not\(\[data-public-card-emphasis="urgent"\]\)/);
  assert.match(rules, /prefers-reduced-motion: reduce/);
  assert.match(rules, /forced-colors: active/);
  assert.doesNotMatch(rules, /aspect-ratio|object-fit|grid-template-columns|\/admin/);
  assert.match(read("components/help-card.tsx"), /data-public-card-emphasis=\{item\.urgent && !item\.resolved/);
  assert.match(read("components/help-card.tsx"), /<PublicActionLink className=\{styles.cardAction\} variant="tertiary"/);
  assert.match(read("components/breed-card.tsx"), /<PublicActionLink href=\{profileHref\} variant="tertiary"/);
});

test("section search uses shared CTA visuals and preserves GET routing", () => {
  const hero = read("components/public-visual-system/unified-section-hero.module.css");
  const search = read("components/section-hero-search.tsx");
  const css = read("components/public-visual-system/public-visual-system.module.css");
  const buttonRules = [...hero.matchAll(/\.hero :global\(\[data-section-hero-search\] button\) \{([^}]*)\}/g)];
  assert.equal(buttonRules.length, 1, "only the responsive width override belongs in hero CSS");
  assert.match(buttonRules[0][1], /width:\s*100%/);
  assert.doesNotMatch(buttonRules[0][1], /background:|color:|border-radius:/);
  assert.match(css, /\.actionPrimary \{[^}]*background: var\(--ps-color-action-primary\)/);
  assert.match(css, /\.action \{[^}]*border-radius: var\(--ps-radius-control, 12px\)/);
  assert.match(search, /<form action=\{action\} method="get"/);
  assert.match(search, /<PublicActionButton type="submit">\{buttonLabel\}<\/PublicActionButton>/);
});
