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
  assert.match(css, /\.action:focus-visible/);
  assert.match(css, /min-height: 44px/);
});

test("all public filter variants take the same existing control radius", () => {
  const tokens = read("components/public-visual-system/public-form-controls.module.css");
  const names = [
    "directory", "help", "events", "catalog", "club", "breed-origin", "breed-section",
  ];
  for (const name of names) {
    assert.ok(
      tokens.includes("--ps-filter-" + name + "-border-radius: var(--ps-radius-control, 12px);"),
      name + " must follow one control radius",
    );
  }
  const directory = read("components/directory-filter-form.module.css");
  const help = read("components/help-public.module.css");
  const events = read("components/events-public.module.css");
  assert.match(directory, /border-radius: var\(--ps-filter-directory-border-radius\)/);
  assert.match(help, /border-radius: var\(--ps-filter-help-border-radius\)/);
  assert.match(events, /border-radius: var\(--ps-filter-events-border-radius\)/);
});

test("directory, help, events and breeds use shared visible actions", () => {
  const directory = read("components/directory-filter-form.tsx");
  const directoryPage = read("components/directory-page.tsx");
  const help = read("components/help-browser.tsx");
  const events = read("components/event-listing-results.tsx");
  const breeds = read("components/breed-browser.tsx");
  assert.match(directory, /<PublicActionButton className=\{styles.submit\} type="submit">Použiť filtre<\/PublicActionButton>/);
  assert.match(directory, /<PublicActionButton type="button" className=\{styles.modalTrigger\}/);
  assert.match(directoryPage, /<PublicActionLink variant="primary" href=\{mapHref/);
  assert.match(directoryPage, /<PublicActionLink variant="secondary" href="\/o-nas#kontakt">/);
  assert.match(help, /<PublicActionButton className=\{styles.searchSubmit\} type="submit">/);
  assert.match(help, /<PublicActionLink className=\{styles.resetFilters\} variant="tertiary"/);
  assert.equal(events.match(/<PublicActionButton type="submit">/g)?.length, 2);
  assert.match(breeds, /className="breed-group-cta"/);
  assert.match(breeds, /toggleGroup\(group\.number\)/);
  assert.match(breeds, /INITIAL_PER_GROUP = 3/);
});

test("local public listing CSS no longer competes with CTA or card tokens", () => {
  const directory = read("components/directory-public.module.css");
  const filter = read("components/directory-filter-form.module.css");
  const help = read("components/help-public.module.css");
  const events = read("components/events-public.module.css");
  assert.match(directory, /\.sidebarCard a:not\(\[data-public-action\]\)/);
  assert.match(directory, /\.sidebarCard \[data-public-action\] \{ width: fit-content/);
  assert.match(directory, /\.sidebarCard \{[\s\S]*?border-radius: var\(--ps-radius-card, 22px\)/);
  assert.doesNotMatch(filter, /\.submit\s*\{[^}]*background:/);
  assert.doesNotMatch(help, /\.searchSubmit\s*\{[^}]*background:/);
  assert.doesNotMatch(events, /\.sidebarContent button, \.listHeading button/);
  assert.match(events, /\.gridCard\s*\{[^}]*border-radius:\s*var\(--ps-radius-card,\s*22px\)/);
});

test("all managed section hero actions use shared CTA variants, keeping only accent as an override", () => {
  const source = read("components/public-visual-system/unified-section-hero.tsx");
  const css = read("components/public-visual-system/unified-section-hero.module.css");
  assert.match(source, /<PublicActionLink[\s\S]*?data-section-hero-cta[\s\S]*?data-variant=\{tone\}/);
  assert.match(source, /variant=\{tone === "secondary" \? "secondary" : "primary"\}/);
  assert.match(css, /\.managedCta\[data-variant="accent"\] \{/);
  assert.doesNotMatch(css, /\.managedCta\[data-variant="primary"\]/);
  assert.doesNotMatch(css, /\.managedCta\[data-variant="secondary"\]/);
  assert.doesNotMatch(css, /\.managedCta:focus-visible/);
});

test("removable active filter chips retain shared touch and focus geometry", () => {
  const css = read("components/public-visual-system/public-result-states.module.css");
  const chip = css.slice(css.indexOf(".removableFilterTag {"), css.indexOf(".removableFilterTag > span:first-child"));
  assert.match(chip, /min-height: var\(--ps-control-min-height, 44px\)/);
  assert.match(chip, /border-radius: var\(--ps-radius-control, 12px\)/);
  assert.match(css, /\.removableFilterTag:focus-visible\s*\{[^}]*outline: 3px solid var\(--forest-dark\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.removableFilterTag:focus-visible/);
  const source = read("components/public-visual-system/public-result-states.tsx");
  assert.match(source, /<a[\s\S]*?data-public-filter-tag/);
});

test("e-shop detail uses shared public CTA variants and semantic surfaces", () => {
  const profile = read("app/recenzie/eshopy/[slug]/page.tsx");
  const css = read("app/recenzie/eshopy/[slug]/eshop-profile.module.css");
  assert.match(profile, /<PublicActionLink variant="primary" href=/);
  assert.match(profile, /<PublicActionLink variant="secondary" href=\{shop\.websiteUrl\} target="_blank" rel="noopener noreferrer">/);
  assert.doesNotMatch(css, /\.heroActions a(?:\s|:|\{)/);
  for (const token of ["--cream", "--ps-border-soft", "--ps-radius-card", "--ps-radius-filter", "--ps-surface-raised"]) {
    assert.ok(css.includes("var(" + token), "missing shared e-shop visual token: " + token);
  }
  assert.match(css, /\.hero h1 \{[^}]*font: 500 clamp\(2rem, 3\.8vw, 3\.5rem\)\/1\.06 Georgia/);
  assert.match(profile, /ESHOP_RATING_FIELDS\.map/);
  assert.match(profile, /shop\.averages \?/);
  assert.match(css, /\.logo img \{[^}]*object-fit: contain/);
});

test("editorial category pages use one shared subcategory navigation component", () => {
  const hub = read("components/portal-hub.tsx");
  const topic = read("components/portal-topic.tsx");
  assert.match(hub, /\{showSectionTabs && <PortalSectionTabs section=\{section\} \/>/);
  assert.match(topic, /const showSectionTabs = isStructuredTopic \|\| isReviews/);
  assert.equal((topic.match(/<PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/g) ?? []).length, 1);
  assert.match(topic, /<UnifiedSectionHero/);
  assert.match(topic, /<SectionHero/);
});
