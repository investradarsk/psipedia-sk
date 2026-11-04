import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("five public content card families opt in to one visible design contract", () => {
  const shared = read("components/public-listing-row-card.tsx");
  assert.match(shared, /data-public-card="event-grid"/);
  assert.match(shared, /data-public-card="directory"/);
  assert.match(shared, /<article[\s\S]*data-event-card/);
  assert.match(shared, /data-public-card-title/);
  assert.match(shared, /data-public-card-meta/);
  for (const [path, marker] of [
    ["components/public-visual-system/public-article-card.tsx", 'data-public-card="article"'],
    ["components/breed-card.tsx", 'data-public-card="breed"'],
    ["components/directory-card.tsx", 'kind="directory"'],
    ["components/help-card.tsx", 'data-public-card="help"'],
    ["components/event-card.tsx", 'kind="event"'],
    ["components/event-card.tsx", 'data-public-card="event-list"'],
  ]) {
    const source = read(path);
    assert.ok(source.includes(marker), path + " must opt in");
    const sharedCard = path === "components/directory-card.tsx" ||
      (path === "components/event-card.tsx" && marker === 'kind="event"');
    if (sharedCard) assert.match(source, /<PublicListingRowCard/);
    // Help cards and shared directory/event rows render semantic title/meta
    // in their imported component rather than duplicating visible markup.
    const rendered = sharedCard
      ? shared
      : path === "components/help-card.tsx"
        ? read("components/public-visual-system/public-help-profile-card.tsx")
        : source;
    assert.match(rendered, /data-public-card-title/, path + " title");
    assert.match(rendered, /data-public-card-meta/, path + " metadata");
  }
});

test("public cards share stateful surfaces but keep urgency and original media", () => {
  const css = read("app/design-system.css");
  const rules = css.slice(css.indexOf("/* PUBLIC-VISUAL-CONSISTENCY:"));
  assert.match(
    rules,
    /\[\s*data-public-card\s*\]\[\s*data-public-card\s*\]\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-card\s*\)/,
  );
  assert.match(rules, /box-shadow:\s*var\(\s*--ps-ds5-card-shadow\s*\)/);
  assert.match(rules, /:hover\s*\{\s*[^}]*transform:\s*var\(\s*--ps-ds5-card-hover-transform\s*\)/);
  assert.match(rules, /:has\(\s*a:focus-visible\s*\)/);
  assert.match(rules, /:not\(\s*\[\s*data-public-card-emphasis="urgent"\s*\]\s*\)/);
  assert.match(rules, /prefers-reduced-motion:\s*reduce/);
  assert.match(rules, /forced-colors:\s*active/);
  assert.doesNotMatch(rules, /aspect-ratio|object-fit|grid-template-columns|\/admin/);
  assert.match(
    read("components/help-card.tsx"),
    /data-public-card-emphasis=\{\s*item\s*\.urgent\s*&&\s*!item\s*\.resolved/,
  );
  assert.match(read("components/help-card.tsx"), /<PublicHelpProfileCard/);
  assert.match(
    read("components/public-visual-system/public-help-profile-card.tsx"),
    /className={styles.action}/,
  );
  assert.match(
    read("components/breed-card.tsx"),
    /<PublicActionLink\s*href=\{\s*profileHref\s*\}\s*variant="tertiary"/,
  );
});

test("section search uses shared CTA visuals and preserves GET routing", () => {
  const hero = read("components/public-visual-system/unified-section-hero.module.css");
  const search = read("components/section-hero-search.tsx");
  const css = read("components/public-visual-system/public-visual-system.module.css");
  const buttonRules = [
    ...hero.matchAll(/\.hero :global\(\[data-section-hero-search\] button\) \{([^}]*)\}/g),
  ];
  assert.equal(buttonRules.length, 1, "only the responsive width override belongs in hero CSS");
  assert.match(buttonRules[0][1], /width:\s*100%/);
  assert.doesNotMatch(buttonRules[0][1], /background:|color:|border-radius:/);
  assert.match(
    css,
    /\s*\.actionPrimary\s*\{\s*[^}]*background:\s*var\(\s*--ps-color-action-primary\s*\)/,
  );
  assert.match(
    css,
    /\s*\.action\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-control,\s*12px\s*\)/,
  );
  assert.match(search, /<form\s*action=\{\s*action\s*\}\s*method="get"/);
  assert.match(
    search,
    /<PublicActionButton\s*type="submit">\{\s*buttonLabel\s*\}<\/PublicActionButton>/,
  );
});
