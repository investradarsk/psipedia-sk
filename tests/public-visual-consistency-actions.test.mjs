import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("canonical CTA component exposes semantic variants for public styling", () => {
  const actions = read("components/public-visual-system/public-visual-system.tsx");
  const css = read("components/public-visual-system/public-visual-system.module.css");
  assert.equal(actions.split("data-public-action={variant}").length - 1, 2);
  for (const variant of ["actionPrimary", "actionSecondary", "actionTertiary"]) {
    assert.match(css, new RegExp("\\." + variant + " \\{"));
  }
  assert.match(css, /\s*\.action:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
});

test("all public filter variants take the same existing control radius", () => {
  const tokens = read("components/public-visual-system/public-form-controls.module.css");
  const names = ["directory", "help", "events", "catalog", "club", "breed-origin", "breed-section"];
  for (const name of names) {
    assert.ok(
      tokens.includes("--ps-filter-" + name + "-border-radius: var(--ps-radius-control, 12px);"),
      name + " must follow one control radius",
    );
  }
  const directory = read("components/directory-filter-form.module.css");
  const help = read("components/help-public.module.css");
  const events = read("components/events-public.module.css");
  assert.match(directory, /border-radius:\s*var\(\s*--ps-filter-directory-border-radius\s*\)/);
  assert.match(help, /border-radius:\s*var\(\s*--ps-filter-help-border-radius\s*\)/);
  assert.match(events, /border-radius:\s*var\(\s*--ps-filter-events-border-radius\s*\)/);
});

test("directory, help, events and breeds use shared visible actions", () => {
  const directory = read("components/directory-filter-form.tsx");
  const directoryPage = read("components/directory-page.tsx");
  const help = read("components/help-browser.tsx");
  const events = read("components/event-listing-results.tsx");
  const breeds = read("components/breed-browser.tsx");
  assert.match(
    directory,
    /<PublicActionButton\s*className=\{\s*styles.submit\s*\}\s*type="submit">\s*Použiť\s*filtre\s*<\/PublicActionButton>/,
  );
  assert.match(
    directory,
    /<PublicActionButton\s*type="button"\s*className=\{\s*styles.modalTrigger\s*\}/,
  );
  assert.match(
    directoryPage,
    /<PublicActionLink\s*id=\{\s*CTA_DIRECTORY_MAP_ANCHOR\s*\}\s*variant="primary"\s*href=\{\s*mapHref/,
  );
  assert.match(directoryPage, /<PublicActionLink\s*variant="secondary"\s*href="\/o-nas#kontakt">/);
  assert.match(
    help,
    /<PublicActionButton\s*className=\{\s*styles.searchSubmit\s*\}\s*type="submit">/,
  );
  assert.match(
    help,
    /<PublicActionLink\s*className=\{\s*styles.resetFilters\s*\}\s*variant="tertiary"/,
  );
  assert.equal(events.match(/<PublicActionButton type="submit">/g)?.length, 2);
  assert.match(breeds, /className="breed-group-cta"/);
  assert.match(breeds, /toggleGroup\(\s*group\s*\.number\s*\)/);
  assert.match(breeds, /INITIAL_PER_GROUP\s*=\s*3/);
});

test("local public listing CSS no longer competes with CTA or card tokens", () => {
  const directory = read("components/directory-public.module.css");
  const filter = read("components/directory-filter-form.module.css");
  const help = read("components/help-public.module.css");
  const events = read("components/events-public.module.css");
  assert.match(directory, /\s*\.sidebarCard\s*a:not\(\s*\[\s*data-public-action\s*\]\s*\)/);
  assert.match(
    directory,
    /\s*\.sidebarCard\s*\[\s*data-public-action\s*\]\s*\{\s*width:\s*fit-content/,
  );
  assert.match(
    directory,
    /\s*\.sidebarCard\s*\{\s*[\s\S]*?border-radius:\s*var\(\s*--ps-radius-card,\s*22px\s*\)/,
  );
  assert.doesNotMatch(filter, /\s*\.submit\s*\{\s*[^}]*background:/);
  assert.doesNotMatch(help, /\s*\.searchSubmit\s*\{\s*[^}]*background:/);
  assert.doesNotMatch(events, /\s*\.sidebarContent\s*button,\s*\.listHeading\s*button/);
  assert.match(
    events,
    /\s*\.gridCard\s*\{\s*[^}]*border-radius:\s*var\(\s*--ps-radius-card,\s*22px\s*\)/,
  );
});

test("all managed section hero actions use shared CTA variants, keeping only accent as an override", () => {
  const source = read("components/public-visual-system/unified-section-hero.tsx");
  const css = read("components/public-visual-system/unified-section-hero.module.css");
  assert.match(
    source,
    /<PublicActionLink[\s\S]*?data-section-hero-cta[\s\S]*?data-variant=\{\s*tone\s*\}/,
  );
  assert.match(
    source,
    /variant=\{\s*tone\s*===\s*"secondary"\s*\?\s*"secondary"\s*:\s*"primary"\s*\}/,
  );
  assert.match(css, /\s*\.managedCta\[\s*data-variant="accent"\s*\]\s*\{\s*/);
  assert.doesNotMatch(css, /\s*\.managedCta\[\s*data-variant="primary"\s*\]/);
  assert.doesNotMatch(css, /\s*\.managedCta\[\s*data-variant="secondary"\s*\]/);
  assert.doesNotMatch(css, /\s*\.managedCta:focus-visible/);
});

test("removable active filter chips retain shared touch and focus geometry", () => {
  const css = read("components/public-visual-system/public-result-states.module.css");
  const chip = css.slice(
    css.indexOf(".removableFilterTag {"),
    css.indexOf(".removableFilterTag > span:first-child"),
  );
  assert.match(chip, /min-height:\s*var\(\s*--ps-control-min-height,\s*44px\s*\)/);
  assert.match(chip, /border-radius:\s*var\(\s*--ps-radius-control,\s*12px\s*\)/);
  assert.match(
    css,
    /\s*\.removableFilterTag:focus-visible\s*\{\s*[^}]*outline:\s*3px\s*solid\s*var\(\s*--forest-dark\s*\)/,
  );
  assert.match(
    css,
    /@media\s*\(\s*forced-colors:\s*active\s*\)[\s\S]*\s*\.removableFilterTag:focus-visible/,
  );
  const source = read("components/public-visual-system/public-result-states.tsx");
  assert.match(source, /<a[\s\S]*?data-public-filter-tag/);
});

test("e-shop detail uses shared public CTA variants and semantic surfaces", () => {
  const profile = read("app/recenzie/eshopy/[slug]/page.tsx");
  const css = read("app/recenzie/eshopy/[slug]/eshop-profile.module.css");
  assert.match(profile, /<PublicActionLink\s*variant="primary"\s*href=/);
  assert.match(
    profile,
    /<PublicActionLink\s*variant="secondary"\s*href=\{\s*shop\s*\.websiteUrl\s*\}\s*target="_blank"\s*rel="noopener\s*noreferrer"\s*>/,
  );
  assert.doesNotMatch(css, /\s*\.heroActions\s*a(?:\s|:|\{\s*)/);
  for (const token of [
    "--cream",
    "--ps-border-soft",
    "--ps-radius-card",
    "--ps-radius-filter",
    "--ps-surface-raised",
  ]) {
    assert.ok(css.includes("var(" + token), "missing shared e-shop visual token: " + token);
  }
  assert.match(
    css,
    /\s*\.hero\s*h1\s*\{\s*[^}]*font:\s*500\s*clamp\(\s*2rem,\s*3\s*\.8vw,\s*3\s*\.5rem\s*\)\/1\s*\.06\s*Georgia/,
  );
  assert.match(profile, /ESHOP_RATING_FIELDS\s*\.map/);
  assert.match(profile, /shop\s*\.averages\s*\?/);
  assert.match(css, /\s*\.logo\s*img\s*\{\s*[^}]*object-fit:\s*contain/);
});

test("editorial category pages use one shared subcategory navigation component", () => {
  const hub = read("components/portal-hub.tsx");
  const topic = read("components/portal-topic.tsx");
  assert.match(
    hub,
    /\{\s*showSectionTabs\s*&&\s*<PortalSectionTabs\s*section=\{\s*section\s*\}\s*\/>/,
  );
  assert.match(topic, /const\s*showSectionTabs\s*=\s*isStructuredTopic\s*\|\|\s*isReviews/);
  assert.equal(
    (topic.match(/<PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/g) ?? [])
      .length,
    1,
  );
  assert.match(topic, /<UnifiedSectionHero/);
  assert.match(topic, /<SectionHero/);
});
