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
  assert.match(breeds, /<PublicActionButton type="button" onClick=\{\(\)=>setShown/);
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
